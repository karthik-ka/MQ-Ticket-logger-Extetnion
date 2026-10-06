(function () {
  'use strict';

  console.log('[MQL-Fill] Script loaded on:', location.href);

  var STORAGE_KEY = 'mqEntries';
  var FILL_DELAY = 1000;
  var OPTION_POLL_INTERVAL = 300;
  var OPTION_POLL_MAX = 20;

  var filling = false;
  var paused = false;

  function log() {
    var args = ['[MQL-Fill]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function storageGet(keys) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.local.get(keys, function (result) {
          var err = chrome.runtime && chrome.runtime.lastError;
          if (err) { log('storage.get error:', err.message); reject(err); }
          else resolve(result);
        });
      } catch (e) { log('storage.get exception:', e.message); reject(e); }
    });
  }

  function delay(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  function waitWhilePaused() {
    return new Promise(function (resolve) {
      if (!paused) return resolve();
      (function check() {
        if (!paused) return resolve();
        setTimeout(check, 200);
      })();
    });
  }

  // --- Floating button ---

  var btnEl = null;

  function createButton(text, color, clickHandler) {
    if (btnEl) btnEl.remove();
    btnEl = document.createElement('button');
    btnEl.id = 'mql-fill-btn';
    btnEl.textContent = text;
    var s = btnEl.style;
    s.position = 'fixed';
    s.bottom = '20px';
    s.right = '20px';
    s.zIndex = '2147483647';
    s.padding = '12px 22px';
    s.borderRadius = '10px';
    s.border = 'none';
    s.background = color || '#16a34a';
    s.color = '#fff';
    s.fontFamily = 'system-ui, sans-serif';
    s.fontSize = '14px';
    s.fontWeight = '700';
    s.boxShadow = '0 4px 16px rgba(0,0,0,0.3)';
    s.cursor = 'pointer';
    s.transition = 'background 0.2s';
    document.body.appendChild(btnEl);
    if (clickHandler) btnEl.addEventListener('click', clickHandler);
    return btnEl;
  }

  // --- DOM helpers ---

  function findButtonByText(texts) {
    var candidates = document.querySelectorAll('button, a, div[role="button"], span, input[type="button"], input[type="submit"]');
    for (var i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      if (el.offsetParent === null && el.style.position !== 'fixed') continue;
      var t = el.textContent.replace(/\s+/g, ' ').trim().toLowerCase();
      for (var j = 0; j < texts.length; j++) {
        if (t === texts[j] || t.indexOf(texts[j]) !== -1) return el;
      }
    }
    return null;
  }

  function findLabelContainer(labelText) {
    var labels = document.querySelectorAll('label');
    for (var i = 0; i < labels.length; i++) {
      var t = labels[i].textContent.replace(/\s+/g, ' ').trim();
      if (t.indexOf(labelText) !== -1) {
        var container = labels[i].closest('.col-md-3') || labels[i].closest('.col-md-6') || labels[i].parentElement;
        return container;
      }
    }
    return null;
  }

  // --- Option matching ---
  //
  // Stored MQ values are written without separators ("InProgress"), while the
  // Hashroot option labels are written with them ("In Progress"). Comparing the
  // raw lowercased strings made the exact AND partial tests both fail for that
  // pair, and the old code then silently selected the first option in the list
  // (Pending). normKey() collapses case and separators so the stored value and
  // the visible label compare equal, whichever side the space is on.

  function normKey(s) {
    return String(s == null ? '' : s).toLowerCase().replace(/[\s_\-./]+/g, '');
  }

  function optionLabel(el) {
    return el.textContent.replace(/\s+/g, ' ').trim();
  }

  function optionLabels(options) {
    var out = [];
    for (var i = 0; i < options.length; i++) out.push(optionLabel(options[i]));
    return out;
  }

  // Returns the matching option element, or null when nothing matches.
  function matchOption(options, value) {
    var target = normKey(value);
    if (!target) return null;
    var i, k;

    // 1. Exact match, separator/case insensitive
    for (i = 0; i < options.length; i++) {
      if (normKey(optionLabel(options[i])) === target) {
        log('Exact match:', optionLabel(options[i]));
        return options[i];
      }
    }

    // 2. Partial match, separator/case insensitive
    for (i = 0; i < options.length; i++) {
      k = normKey(optionLabel(options[i]));
      if (k && (k.indexOf(target) !== -1 || target.indexOf(k) !== -1)) {
        log('Partial match:', optionLabel(options[i]));
        return options[i];
      }
    }

    return null;
  }

  // --- React-select interaction (robust) ---

  function selectReactOption(container, value) {
    if (!container) {
      log('No container for react-select');
      return Promise.resolve(false);
    }

    var rsContainer = container.querySelector('.react-select');
    if (!rsContainer) {
      log('No .react-select element in container');
      return Promise.resolve(false);
    }

    var control = rsContainer.querySelector('[class*="-control"]');
    var input = rsContainer.querySelector('input[id^="react-select-"]');

    if (!control || !input) {
      log('No control or input found in react-select');
      return Promise.resolve(false);
    }

    log('Attempting to select "' + value + '" in react-select');

    // Open dropdown: mousedown on control, then focus input
    var mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
    control.dispatchEvent(mousedown);
    input.focus();
    input.dispatchEvent(new Event('focus', { bubbles: true }));

    return new Promise(function (resolve) {
      var attempts = 0;

      function pollOptions() {
        attempts++;

        // Try multiple selectors to find options
        var options = rsContainer.querySelectorAll('[role="option"]');
        if (!options.length) {
          options = rsContainer.querySelectorAll('[class*="-option"]');
        }
        if (!options.length) {
          // Try the global menu portal (react-select renders menus in a portal sometimes)
          options = document.querySelectorAll('[id^="react-select-"][id*="-option-"]');
        }

        if (!options.length && attempts < OPTION_POLL_MAX) {
          log('Waiting for options... attempt', attempts);
          setTimeout(pollOptions, OPTION_POLL_INTERVAL);
          return;
        }

        if (!options.length) {
          log('No options found after', attempts, 'attempts. Trying keyboard approach...');
          // Fallback: type the value and press Enter
          input.value = value;
          input.dispatchEvent(new Event('input', { bubbles: true }));
          setTimeout(function () {
            var enterEvent = new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, bubbles: true });
            input.dispatchEvent(enterEvent);
            log('Typed value and pressed Enter as fallback');
            resolve(false);
          }, 500);
          return;
        }

        log('Found', options.length, 'options:', optionLabels(options).join(' | '));

        var matched = matchOption(options, value);

        // Only auto-accept when there is genuinely no choice to make.
        if (!matched && options.length === 1) {
          matched = options[0];
          log('Single option — using it:', optionLabel(matched));
        }

        if (!matched) {
          // Never guess: picking an arbitrary option is what wrote Pending into
          // the worksheet for In Progress entries.
          log('NO MATCH for "' + value + '" — leaving field untouched');
          resolve(false);
          return;
        }

        // Use mousedown + click for react-select option selection
        matched.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        matched.click();
        log('Selected:', optionLabel(matched));
        resolve(true);
      }

      setTimeout(pollOptions, 500);
    });
  }

  // --- Text input helper ---

  function setTextInput(el, value) {
    if (!el) return;
    var proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
    if (descriptor && descriptor.set) {
      descriptor.set.call(el, value);
    } else {
      el.value = value;
    }
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    log('Set text input:', value);
  }

  // --- Current Status mapping (FDC -> hashroot) ---

  function mapCurrentStatus(entry) {
    if (entry.statusOverride) return entry.statusOverride;
    var s = (entry.status || '').toLowerCase();
    if (s === 'failed' || s === 'failed to start' || s === 'no disks') return 'Failed';
    if (s === 'pending') return 'Pending';
    if (s === 'awaiting rerun') return 'Blocked';
    if (s === 'escalated') return 'Escalated';
    if (s === 'completed') return 'Completed';
    return 'InProgress';
  }

  function mapSuccessCriteria(entry) {
    if (entry.result === 'pass') return 'Yes';
    if (entry.result === 'fail') return 'No';
    return 'N/A';
  }

  function waitForField(labelText, timeout) {
    timeout = timeout || 10000;
    var start = Date.now();
    return new Promise(function (resolve, reject) {
      (function poll() {
        var container = findLabelContainer(labelText);
        if (container) return resolve(container);
        if (Date.now() - start > timeout) return reject(new Error('Timeout waiting for field: ' + labelText));
        setTimeout(poll, 300);
      })();
    });
  }

  // --- Fill one entry ---

  function clickAdd() {
    return waitWhilePaused().then(function () {
      var addBtn = findButtonByText(['add entry', 'add new', '+ add']);
      if (!addBtn) {
        log('Add Entry button not found — form may already be open');
        return;
      }
      addBtn.click();
      log('Clicked Add Entry');
      return delay(FILL_DELAY);
    });
  }

  function fillEasyDcimId(entry) {
    return waitWhilePaused().then(function () {
      var container = findLabelContainer('EasyDCIM ID');
      if (!container) { log('EasyDCIM ID container not found'); return; }
      var input = container.querySelector('input[type="text"]');
      if (input && entry.deviceId) {
        setTextInput(input, String(entry.deviceId));
      } else {
        log('EasyDCIM ID input not found or no deviceId');
      }
    });
  }

  function selectPhase(entry) {
    return waitWhilePaused().then(function () {
      var container = findLabelContainer('Phase');
      if (container && entry.phase) {
        var p = String(entry.phase).replace(/\s+/g, ' ').trim();
        if (!p || p === '-' || p === '—') p = 'pending';
        var phaseVal = p === 'Health Check' ? 'HHR' : p;
        return selectReactOption(container, phaseVal);
      }
      log('Phase container or value not found');
    });
  }

  function selectCurrentStatus(entry) {
    return waitWhilePaused().then(function () {
      var container = findLabelContainer('Current Status');
      if (!container) { log('Current Status container not found'); return; }
      return selectReactOption(container, mapCurrentStatus(entry));
    });
  }

  function selectEscalationRequired(entry) {
    return waitWhilePaused().then(function () {
      var container = findLabelContainer('Escalation Required');
      if (!container) { log('Escalation Required container not found'); return; }
      var escVal = entry.escalation === 'yes' ? 'Yes' : entry.escalation === 'no' ? 'No' : 'No';
      return selectReactOption(container, escVal).then(function () {
        return escVal === 'Yes';
      });
    });
  }

  function fillScenario2(entry) {
    // Wait for the revealed fields after selecting Yes
    return waitForField('MQ Ticket ID').then(function () {
      return waitWhilePaused();
    }).then(function () {
      // MQ Ticket ID
      var container = findLabelContainer('MQ Ticket ID');
      if (container) {
        var input = container.querySelector('input[type="text"], textarea');
        if (input && entry.whmcsTicket) setTextInput(input, entry.whmcsTicket);
      }
    }).then(function () {
      return waitWhilePaused();
    }).then(function () {
      // Escalation Flag Marked? -> yes/no
      var container = findLabelContainer('Escalation Flag Marked');
      if (container) {
        return selectReactOption(container, entry.flagMarked ? 'Yes' : 'No');
      }
    }).then(function () {
      return waitWhilePaused();
    }).then(function () {
      // Success Criteria Met?
      var container = findLabelContainer('Success Criteria Met');
      if (container) {
        return selectReactOption(container, mapSuccessCriteria(entry));
      }
    }).then(function () {
      return waitWhilePaused();
    }).then(function () {
      // Escalated To
      var container = findLabelContainer('Escalated To');
      if (container && entry.escalatedTo) {
        return selectReactOption(container, entry.escalatedTo);
      }
    }).then(function () {
      return waitWhilePaused();
    }).then(function () {
      // Escalation Reason -> note (keep blank logic: only fill if note exists? per user: remarks blank, reason = note)
      var container = findLabelContainer('Escalation Reason');
      if (container) {
        var input = container.querySelector('input[type="text"], textarea');
        if (input && entry.note) setTextInput(input, entry.note);
      }
    });
  }

  function selectSuccessCriteria(entry) {
    return waitWhilePaused().then(function () {
      var container = findLabelContainer('Success Criteria Met');
      if (!container) { log('Success Criteria Met container not found — skipping'); return; }
      return selectReactOption(container, mapSuccessCriteria(entry));
    });
  }

  function clickSave() {
    return waitWhilePaused().then(function () {
      return delay(400);
    }).then(function () {
      var saveBtn = findButtonByText(['save entry', 'save']);
      if (saveBtn) {
        saveBtn.click();
        log('Clicked Save Entry');
        return delay(FILL_DELAY);
      }
      log('Save button not found');
    });
  }

  function fillEntry(entry) {
    log('Filling entry:', entry.id, 'deviceId:', entry.deviceId, 'escalation:', entry.escalation);

    return clickAdd()
      .then(function () { return fillEasyDcimId(entry); })
      .then(function () { return selectPhase(entry); })
      .then(function () { return selectCurrentStatus(entry); })
      .then(function () { return selectEscalationRequired(entry); })
      .then(function (isYes) {
        if (isYes) {
          log('Escalation = Yes -> Scenario 2, waiting for revealed fields');
          return fillScenario2(entry);
        }
        log('Escalation = No -> Scenario 1, filling Success Criteria');
        return selectSuccessCriteria(entry);
      })
      .then(function () { return clickSave(); });
  }

  // --- Start / Pause / Resume ---

  function updateButton(state, current, total) {
    if (state === 'filling') {
      createButton('Filling ' + current + ' / ' + total + '   \u23F8 Pause', '#16a34a', function () {
        paused = true;
        updateButton('paused', current, total);
      });
    } else if (state === 'paused') {
      createButton('Paused (' + current + ' / ' + total + ')   \u25B6 Resume', '#d97706', function () {
        paused = false;
        updateButton('filling', current, total);
      });
    } else if (state === 'done') {
      createButton('Done \u2713  (' + total + ' filled)', '#0d5c1e', null);
      btnEl.style.pointerEvents = 'none';
      setTimeout(function () { showIdleButton(); }, 3000);
    } else if (state === 'empty') {
      createButton('No entries found', '#6b7280', null);
      setTimeout(function () { showIdleButton(); }, 2000);
    }
  }

  function showIdleButton() {
    createButton('AutoFill entries from MQ Logger', '#16a34a', startFill);
    log('Idle button shown');
  }

  async function startFill() {
    if (filling) return;
    filling = true;
    paused = false;

    var r = await storageGet(STORAGE_KEY);
    var entries = Array.isArray(r[STORAGE_KEY]) ? r[STORAGE_KEY] : [];
    if (!entries.length) {
      updateButton('empty');
      filling = false;
      return;
    }

    var sorted = entries.slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    log('Starting fill with', sorted.length, 'entries');

    for (var i = 0; i < sorted.length; i++) {
      updateButton('filling', i + 1, sorted.length);

      await waitWhilePaused();

      try {
        await fillEntry(sorted[i]);
        log('Entry', i + 1, 'of', sorted.length, 'done');
      } catch (err) {
        log('Fill error on entry', i + 1, ':', err);
      }
    }

    updateButton('done', sorted.length, sorted.length);
    filling = false;
    paused = false;
  }

  // --- Init: always show button ---

  function init() {
    log('init called, body exists:', !!document.body);
    showIdleButton();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 1500); });
  } else {
    setTimeout(init, 1500);
  }
})();
