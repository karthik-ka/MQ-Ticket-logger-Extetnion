(function () {
  'use strict';

  var STORAGE_KEY = 'mqEntries';

  // action label -> the partner it merges with (and only with)
  var PAIR = {
    'Confirm BIOS': 'Confirm Boot Order',
    'Confirm Boot Order': 'Confirm BIOS'
  };

  var QUAL_RE = /\/admin\/qualification\/machinequalification\/(\d+)\/change\//;

  // Actions that must never produce an mqEntries record.
  //
  // collect.js has no API/event payload to inspect — it only ever sees the label
  // of the <a class="button"> that was clicked inside the Actions field-row.
  // That label is therefore the reliable discriminator, and it is matched by
  // exact equality against this small list rather than by substring, so no other
  // qualification action can be caught by accident.
  var NO_LOG_ACTIONS = ['force fail', 'force-fail', 'forcefail', 'force failure'];

  function isNoLogAction(action) {
    var k = String(action == null ? '' : action).toLowerCase().replace(/\s+/g, ' ').trim();
    for (var i = 0; i < NO_LOG_ACTIONS.length; i++) {
      if (k === NO_LOG_ACTIONS[i]) return true;
    }
    return false;
  }

  function log() {
    var args = ['[MQL]'].concat(Array.prototype.slice.call(arguments));
    console.log.apply(console, args);
  }

  function storageGet(keys) {
    return new Promise(function (resolve) { chrome.storage.local.get(keys, resolve); });
  }

  function storageSet(obj) {
    return new Promise(function (resolve, reject) {
      chrome.storage.local.set(obj, function () {
        var err = chrome.runtime.lastError;
        err ? reject(new Error(err.message)) : resolve();
      });
    });
  }

  // Scrape the General fieldset: label -> { text, href }
  function scrapeFields() {
    var fields = {};
    var fieldLines = document.querySelectorAll('form .field-line');
    Array.prototype.forEach.call(fieldLines, function (fl) {
      var labelEl = fl.querySelector('label');
      if (!labelEl) return;
      var label = labelEl.textContent.replace(/\s+/g, ' ').trim();
      if (!label) return;
      var valEl = fl.querySelector('.readonly') || fl;
      var anchor = valEl.querySelector('a[href]');
      fields[label] = {
        text: (anchor || valEl).textContent.replace(/\s+/g, ' ').trim(),
        href: anchor ? anchor.getAttribute('href') : null
      };
    });
    return fields;
  }

  function firstNumber(str) {
    if (!str) return null;
    var m = String(str).match(/\d+/);
    return m ? m[0] : null;
  }

  function pageContext() {
    var m = location.pathname.match(QUAL_RE);
    var qualId = m ? Number(m[1]) : null;
    var fields = scrapeFields();

    var dev = fields['EasyDCIM Device ID'] || {};
    var deviceId = firstNumber(dev.text);
    var deviceUrl = dev.href ||
      (deviceId ? 'https://devices.fdcservers.net/backend/devices/' + deviceId + '/summary' : null);

    return {
      qualId: qualId,
      qualUrl: qualId
        ? location.origin + '/admin/qualification/machinequalification/' + qualId + '/change/'
        : null,
      deviceId: deviceId,
      deviceUrl: deviceUrl,
      whmcsTicket: (fields['WHMCS Ticket'] || {}).text || '',
      status: (fields['Status'] || {}).text || '',
      phase: (fields['Current phase'] || {}).text || ''
    };
  }

  function makeEntry(ctx, actions, open) {
    var now = new Date();
    return {
      id: Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      ts: now.getTime(),
      iso: now.toISOString(),
      qualId: ctx.qualId,
      qualUrl: ctx.qualUrl,
      deviceId: ctx.deviceId,
      deviceUrl: ctx.deviceUrl,
      whmcsTicket: ctx.whmcsTicket,
      status: ctx.status,
      phase: ctx.phase,
      actions: actions,
      open: !!open
    };
  }

  // Merge rule: only 'Confirm BIOS' <-> 'Confirm Boot Order' on the same qual merge.
  // Everything else is its own entry.
  async function record(ctx, action) {
    var r = await storageGet(STORAGE_KEY);
    var entries = Array.isArray(r[STORAGE_KEY]) ? r[STORAGE_KEY] : [];
    var entry;

    if (Object.prototype.hasOwnProperty.call(PAIR, action)) {
      var partner = PAIR[action];
      var candidate = null;
      for (var i = entries.length - 1; i >= 0; i--) {
        var e = entries[i];
        if (
          e &&
          e.open &&
          e.qualId === ctx.qualId &&
          Array.isArray(e.actions) &&
          e.actions.length === 1 &&
          e.actions[0] === partner
        ) {
          candidate = e;
          break;
        }
      }
      if (candidate) {
        candidate.actions.push(action);
        candidate.open = false;
        entry = candidate;
      } else {
        entry = makeEntry(ctx, [action], true);
        entries.push(entry);
      }
    } else {
      entry = makeEntry(ctx, [action], false);
      entries.push(entry);
    }

    var payload = {};
    payload[STORAGE_KEY] = entries;
    await storageSet(payload);
    log('saved', JSON.stringify(entry));
    return true;
  }

  function toast(msg, isError) {
    var el = document.createElement('div');
    el.textContent = msg;
    var s = el.style;
    s.position = 'fixed';
    s.top = '16px';
    s.right = '16px';
    s.zIndex = '2147483647';
    s.padding = '10px 14px';
    s.borderRadius = '8px';
    s.fontFamily = 'system-ui, sans-serif';
    s.fontSize = '13px';
    s.fontWeight = '600';
    s.boxShadow = '0 2px 10px rgba(0,0,0,0.25)';
    if (isError) {
      s.color = '#fff';
      s.background = '#ba2121';
      s.border = '1px solid #4a0000';
    } else {
      s.color = '#0d5c1e';
      s.background = '#e6f4ea';
      s.border = '1px solid #0d5c1e';
    }
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, 2500);
  }

  function onClick(ev, btn) {
    ev.preventDefault();
    ev.stopPropagation();
    var href = btn.getAttribute('href');
    var action = btn.textContent.replace(/\s+/g, ' ').trim();
    var ctx = pageContext();

    if (!ctx.qualId) {
      toast('MQL: could not read qual ID from URL', true);
      window.location.assign(href || location.href);
      return;
    }

    // Force Fail must not create a record. Navigation still proceeds exactly as
    // it would have, so no FDC behaviour is altered.
    if (isNoLogAction(action)) {
      log('skipping entry for action:', action);
      window.location.assign(href || location.href);
      return;
    }

    record(ctx, action).then(function () {
      toast('Logged: ' + action);
      window.location.assign(href || location.href);
    }).catch(function (err) {
      log('save failed', err);
      toast('MQL: failed to log entry', true);
      window.location.assign(href || location.href);
    });
  }

  function attachActions() {
    var actionsRow = null;
    Array.prototype.forEach.call(document.querySelectorAll('form .field-line'), function (fl) {
      var labelEl = fl.querySelector('label');
      if (labelEl && labelEl.textContent.replace(/\s+/g, ' ').trim() === 'Actions') {
        actionsRow = fl;
      }
    });
    if (!actionsRow) return;

    var buttons = actionsRow.querySelectorAll('a.button');
    Array.prototype.forEach.call(buttons, function (btn) {
      if (btn.dataset.mqLogger) return;
      btn.dataset.mqLogger = '1';
      btn.addEventListener('click', function (ev) { onClick(ev, btn); });
    });
    if (buttons.length) log('wired', buttons.length, 'action button(s)');
  }

  function init() {
    attachActions();
    if (window.MutationObserver) {
      var mo = new MutationObserver(function () { attachActions(); });
      mo.observe(document.body, { childList: true, subtree: true });
      setTimeout(function () { mo.disconnect(); }, 30000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(init, 300); });
  } else {
    setTimeout(init, 300);
  }
})();