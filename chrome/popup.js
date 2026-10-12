(function () {
  'use strict';

  var SK = 'mqEntries', FK = 'mqFormState', TK = 'mqTheme';
  var ORIGIN = 'https://api.fdcservers.io', DDEV = 'https://devices.fdcservers.net';

  var listEl = document.getElementById('list');
  var emptyEl = document.getElementById('empty');
  var countEl = document.getElementById('count');
  var formStatusEl = document.getElementById('formStatus');
  var fQ = document.getElementById('f-qualid');
  var fD = document.getElementById('f-deviceid');
  var fW = document.getElementById('f-whmcs');
  var fS = document.getElementById('f-status');
  var fP = document.getElementById('f-phase');
  var fA = document.getElementById('f-actions');
  var themeBtn = document.getElementById('themeBtn');
  var addEntryBtn = document.getElementById('addEntryBtn');
  var backBtn = document.getElementById('backBtn');
  var pE = document.getElementById('panel-entries');
  var pA = document.getElementById('panel-add');
  var pB = document.getElementById('panel-bulk');

  var expanded = {};
  var SUN = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><circle cx="8" cy="8" r="3"/><path d="M8 1v2M8 13v2M1 8h2M13 8h2M3 3l1.5 1.5M11.5 11.5L13 13M13 3l-1.5 1.5M4.5 11.5L3 13"/></svg>';
  var MOON = '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"><path d="M13.5 9.5A6 6 0 1 1 6.5 2.5a4.8 4.8 0 0 0 7 7z"/></svg>';
  var CHEV = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6l4 4 4-4"/></svg>';
  var TRASH = '<svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3 4h10"/><path d="M6 4V2.8h4V4"/><path d="M4.5 4l.6 9h5.8l.6-9"/><path d="M6.6 7v3.4"/><path d="M9.4 7v3.4"/></svg>';

  /* Theme */
  function applyTheme(t) {
    var d = t === 'dark';
    document.documentElement.setAttribute('data-theme', d ? 'dark' : 'light');
    themeBtn.innerHTML = d ? SUN : MOON;
  }
  themeBtn.addEventListener('click', function () {
    var c = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
    var n = c === 'dark' ? 'light' : 'dark';
    applyTheme(n);
    var p = {}; p[TK] = n; sSet(p);
  });

  /* View switching */
  function showView(view) {
    if (view === 'add') {
      pE.hidden = true;
      pB.hidden = true;
      pA.hidden = false;
    } else if (view === 'bulk') {
      pE.hidden = true;
      pA.hidden = true;
      pB.hidden = false;
    } else {
      pA.hidden = true;
      pB.hidden = true;
      pE.hidden = false;
      load();
    }
  }
  addEntryBtn.addEventListener('click', function () { showView('add'); });
  document.getElementById('bulkBtn').addEventListener('click', function () { showView('bulk'); });
  backBtn.addEventListener('click', function () { showView('entries'); });

  /* Storage */
  function sGet(k) { return new Promise(function (r) { chrome.storage.local.get(k, r); }); }
  function sSet(o) { return new Promise(function (r) { chrome.storage.local.set(o, r); }); }
  function getEntries() {
    return sGet(SK).then(function (r) {
      var es = Array.isArray(r[SK]) ? r[SK] : [];
      var changed = false;
      for (var i = 0; i < es.length; i++) {
        var e = es[i];
        if (!e) continue;
        var v = e.phase == null ? '' : String(e.phase).replace(/\s+/g, ' ').trim();
        if (!v || v === '-' || v === '\u2014') {
          e.phase = 'pending';
          changed = true;
        }
      }
      if (changed) {
        var p = {};
        p[SK] = es;
        return sSet(p).then(function () { return es; });
      }
      return es;
    });
  }
  function saveEntries(e) { var p = {}; p[SK] = e; return sSet(p); }
  function findEntry(a, id) { for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; }
  function pad(n) { return n < 10 ? '0' + n : n; }
  function fmtTime(ts) { var d = new Date(ts); return isNaN(d.getTime()) ? '' : pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function fmtFull(ts) { var d = new Date(ts); if (isNaN(d.getTime())) return ''; return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function entryLines(e) {
    var l = [];
    l.push('Qual ID: ' + (e.qualId || '-') + (e.qualUrl ? ' (' + e.qualUrl + ')' : ''));
    l.push('Device ID: ' + (e.deviceId || '-') + (e.deviceUrl ? ' (' + e.deviceUrl + ')' : ''));
    if (e.whmcsTicket) l.push('Ticket ID: ' + e.whmcsTicket);
    l.push('Current phase: ' + (e.phase || '-'));
    if (e.statusOverride) l.push('Current Status: ' + e.statusOverride);
    else if (e.status) l.push('Status: ' + e.status);
    if (e.escalation) l.push('Escalation Required: ' + e.escalation);
    if (e.flagMarked != null) l.push('ESC Flag Marked: ' + (e.flagMarked ? 'YES' : 'NO'));
    if (e.escalatedTo) l.push('Escalated To: ' + e.escalatedTo);
    l.push('Actions: ' + (Array.isArray(e.actions) ? e.actions.join(', ') : (e.actions || '-')));
    l.push('Time: ' + fmtFull(e.ts));
    if (e.result) l.push('Success Criteria Met: ' + (e.result === 'pass' ? 'Yes' : e.result === 'fail' ? 'No' : e.result));
    if (e.note) l.push('Note: ' + e.note);
    return l.join('\n');
  }

  var SOPTS = [
    { v: '', t: 'Auto' }, { v: 'InProgress', t: 'InProgress' }, { v: 'Completed', t: 'Completed' },
    { v: 'Blocked', t: 'Blocked' }, { v: 'Failed', t: 'Failed' },
    { v: 'Escalated', t: 'Escalated' }, { v: 'Pending', t: 'Pending' }
  ];
  var EOPTS = [
    { v: '', t: '--' }, { v: 'No Escalation', t: 'No Escalation' },
    { v: 'Midhun', t: 'Midhun' }, { v: 'Shift Manager', t: 'Shift Manager' }, { v: 'Onsite', t: 'Onsite' }
  ];

  function statusCls(v) {
    if (!v) return '';
    var s = v.toLowerCase();
    if (s === 'inprogress') return 'inprogress';
    if (s === 'completed') return 'completed';
    if (s === 'failed' || s === 'failed to start' || s === 'no disks') return 'failed';
    if (s === 'blocked' || s === 'awaiting rerun') return 'blocked';
    if (s === 'pending') return 'pending';
    if (s === 'escalated') return 'escalated';
    return '';
  }

  function ddHtml(cur, opts, field, displayText) {
    var isStatus = field === 'statusOverride';
    var label = displayText || cur || '--';
    var cls = isStatus ? statusCls(cur || label) : '';
    var stAttr = cls ? ' data-st="' + cls + '"' : '';
    var h = '<div class="dd" data-field="' + field + '" data-val="' + esc(cur || '') + '">';
    h += '<div class="dd-cur"' + stAttr + '>' + esc(label) + '</div>';
    h += '<div class="dd-list">';
    for (var i = 0; i < opts.length; i++) {
      var itemCls = isStatus ? statusCls(opts[i].v) : '';
      var itemSt = itemCls ? ' data-st="' + itemCls + '"' : '';
      h += '<div class="dd-item' + (cur === opts[i].v ? ' sel' : '') + '" data-v="' + esc(opts[i].v) + '"' + itemSt + '>' + esc(opts[i].t) + '</div>';
    }
    return h + '</div></div>';
  }

  /* Render entries as expandable table rows */
  function render(entries) {
    countEl.textContent = entries.length ? entries.length + ' entr' + (entries.length === 1 ? 'y' : 'ies') : '';

    /* Fix: only show empty state when 0 entries */
    if (entries.length === 0) {
      emptyEl.classList.add('show');
    } else {
      emptyEl.classList.remove('show');
    }

    var sorted = entries.slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
    var rows = '';

    for (var i = 0; i < sorted.length; i++) {
      var e = sorted[i];
      var isExpanded = !!expanded[e.id];

      var qLink = e.qualUrl
        ? '<a href="' + esc(e.qualUrl) + '" target="_blank" onclick="event.stopPropagation()">' + esc(e.qualId) + '</a>'
        : esc(e.qualId || '-');
      var dLink = e.deviceUrl
        ? '<a href="' + esc(e.deviceUrl) + '" target="_blank" onclick="event.stopPropagation()">' + esc(e.deviceId) + '</a>'
        : esc(e.deviceId || '-');
      var escClass = e.escalation === 'yes' ? ' ey' : e.escalation === 'no' ? ' en' : ' ec';
      var escLabel = e.escalation === 'yes' ? 'YES' : e.escalation === 'no' ? 'NO' : '\u2014';

      /* Main row — 7 columns */
      rows += '<tr class="main-row' + (isExpanded ? ' expanded' : '') + '" data-id="' + esc(e.id) + '">';
      rows += '<td class="mc">' + qLink + '</td>';
      rows += '<td class="md">' + dLink + '</td>';
      rows += '<td class="mw">' + esc(e.whmcsTicket || '-') + '</td>';
      rows += '<td class="mp">' + esc(e.phase || '-') + '</td>';
      rows += '<td class="ms">' + ddHtml(e.statusOverride || '', SOPTS, 'statusOverride', e.statusOverride || e.status || '') + '</td>';
      rows += '<td class="me"><button class="btn' + escClass + '" data-a="esc">' + escLabel + '</button></td>';
      rows += '<td class="mx"><button class="del-ico" data-a="del" title="Delete">' + TRASH + '</button><span class="exp-ico">' + CHEV + '</span></td>';
      rows += '</tr>';

      /* Detail row — colspan 7 */
      rows += '<tr class="detail-row' + (isExpanded ? ' open' : '') + '" data-id="' + esc(e.id) + '">';
      rows += '<td colspan="7">';
      rows += '<div class="det-inner">';

      /* Success Criteria — Pass→Yes, Fail→No */
      var scClass = e.result === 'pass' ? ' sp' : e.result === 'fail' ? ' sf' : ' sn';
      var scLabel = e.result === 'pass' ? '\u2713 Yes' : e.result === 'fail' ? '\u2717 No' : '\u2014';
      rows += '<div><div class="det-label">Success Criteria Met</div><button class="btn' + scClass + '" data-a="result" style="width:100%">' + scLabel + '</button></div>';

      /* ESC FLAG MARKED (matches Success Criteria style) */
      var flClass = e.flagMarked === true ? ' sp' : (e.flagMarked === false ? ' sf' : ' sn');
      var flLabel = e.flagMarked === true ? '✓ Yes' : (e.flagMarked === false ? '✗ No' : '\u2014');
      rows += '<div><div class="det-label">ESC Flag Marked</div><button class="btn' + flClass + '" data-a="flag" style="width:100%">' + flLabel + '</button></div>';

      /* Escalated To */
      rows += '<div><div class="det-label">Escalated To</div>' + ddHtml(e.escalatedTo || '', EOPTS, 'escalatedTo') + '</div>';

      /* Note — full width */
      rows += '<div class="det-full"><div class="det-label">Note</div><textarea class="ni" data-a="note" placeholder="Add a note...">' + esc(e.note || '') + '</textarea></div>';

      rows += '</div></td></tr>';
    }

    listEl.innerHTML =
      '<table class="et"><thead><tr>' +
      '<th class="mc">Qual</th>' +
      '<th class="md">Device</th>' +
      '<th class="mw">Ticket ID</th>' +
      '<th class="mp">Phase</th>' +
      '<th class="ms">Status</th>' +
      '<th class="me">Esc</th>' +
      '<th class="mx"></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function load() {
    sGet([SK, FK]).then(function (r) {
      render(Array.isArray(r[SK]) ? r[SK] : []);
      restF(r[FK] || {});
    });
  }

  /* Dropdown */
  function closeAll() {
    var o = listEl.querySelectorAll('.dd.open');
    for (var i = 0; i < o.length; i++) o[i].classList.remove('open');
  }

  /* Events — single delegated listener on listEl */
  listEl.addEventListener('click', function (ev) {
    var dd = ev.target.closest('.dd');
    var item = ev.target.closest('.dd-item');

    /* Close dropdowns when clicking outside */
    if (!dd) closeAll();

    /* Toggle dropdown open */
    if (dd && !item) {
      ev.stopPropagation();
      var was = dd.classList.contains('open');
      closeAll();
      if (!was) {
        dd.classList.add('open');
        var rect = dd.getBoundingClientRect();
        var popupH = document.body.clientHeight;
        if (rect.bottom + 130 > popupH) dd.classList.add('up');
        else dd.classList.remove('up');
      }
      return;
    }

    /* Select dropdown item */
    if (item) {
      var p = item.closest('.dd');
      var val = item.getAttribute('data-v');
      var field = p.getAttribute('data-field');
      p.setAttribute('data-val', val);
      p.querySelector('.dd-cur').textContent = item.textContent;
      p.classList.remove('open');
      /* Find parent row — could be main-row or detail-row */
      var tr = p.closest('tr');
      if (tr) {
        var id = tr.getAttribute('data-id');
        getEntries().then(function (entries) {
          var e = findEntry(entries, id);
          if (e) {
            if (val) e[field] = val;
            else delete e[field];
            saveEntries(entries).then(function () { render(entries); });
          }
        });
      }
      return;
    }

    /* Check data-a actions FIRST (works for both main-row and detail-row) */
    var a = ev.target.getAttribute('data-a');
    if (!a) {
      var b = ev.target.closest('[data-a]');
      if (b) a = b.getAttribute('data-a');
      if (!a) {
        var pb = ev.target.parentElement;
        if (pb && pb.getAttribute('data-a')) a = pb.getAttribute('data-a');
      }
    }

            if (a === 'del') {
              var tr = ev.target.closest('tr');
              if (tr) {
                var id = tr.getAttribute('data-id');
                if (id)
                  getEntries().then(function (es) {
                    delete expanded[id];
                    saveEntries(es.filter(function (e) { return e.id !== id; })).then(function () { load(); });
                  });
              }
              return;
            }

    if (a === 'esc' || a === 'result' || a === 'flag') {
      var tr = ev.target.closest('tr');
      if (tr) {
        var id = tr.getAttribute('data-id');
        if (id) {
          getEntries().then(function (es) {
            var e = findEntry(es, id);
            if (!e) return;
            if (a === 'esc') {
              e.escalation = !e.escalation ? 'yes' : e.escalation === 'yes' ? 'no' : null;
            } else if (a === 'result') {
              e.result = !e.result ? 'pass' : e.result === 'pass' ? 'fail' : null;
            } else if (a === 'flag') {
              // Toggle: null/undefined/false -> true -> false -> null
              if (e.flagMarked === true) {
                e.flagMarked = false;
              } else if (e.flagMarked === false) {
                e.flagMarked = null;
              } else {
                e.flagMarked = true;
              }
            }
            saveEntries(es).then(function () { render(es); });
          });
        }
      }
      return;
    }

    /* Check if click is on a main row (expand/collapse) */
    var mainRow = ev.target.closest('tr.main-row');
    if (mainRow) {
      /* Don't toggle if click was on a link or dropdown */
      if (ev.target.closest('a') || ev.target.closest('.dd')) return;
      var id = mainRow.getAttribute('data-id');
      if (id) {
        if (expanded[id]) delete expanded[id];
        else expanded[id] = true;
        load();
      }
      return;
    }
  });

  /* Note save on blur */
  listEl.addEventListener('blur', function (ev) {
    if (ev.target.getAttribute('data-a') === 'note') {
      var detRow = ev.target.closest('tr.detail-row');
      if (!detRow) return;
      var id = detRow.getAttribute('data-id');
      if (!id) return;
      getEntries().then(function (es) {
        var e = findEntry(es, id);
        if (e) { e.note = ev.target.value; saveEntries(es); }
      });
    }
  }, true);

  document.addEventListener('click', function () { closeAll(); });

  /* Copy / Clear / Open All */
  document.getElementById('openAllBtn').addEventListener('click', function () {
    getEntries().then(function (es) {
      var urls = es.map(function (e) { return e.qualUrl; }).filter(Boolean);
      if (!urls.length) { showFS('No qual URLs to open.', true); return; }
      urls.forEach(function (url, i) {
        setTimeout(function () { chrome.tabs.create({ url: url, active: false }); }, i * 150);
      });
      showFS('Opening ' + urls.length + ' qual link' + (urls.length === 1 ? '' : 's') + '...');
    });
  });
  document.getElementById('copyAllBtn').addEventListener('click', function () {
    getEntries().then(function (es) {
      if (!es.length) { showFS('Nothing to copy.', true); return; }
      var s = es.slice().sort(function (a, b) { return (a.ts || 0) - (b.ts || 0); });
      cpTxt(s.map(entryLines).join('\n\n'));
      showFS('Copied ' + s.length + ' entr' + (s.length === 1 ? 'y' : 'ies') + '.');
    });
  });
  document.getElementById('clearBtn').addEventListener('click', function () {
    saveEntries([]).then(function () { expanded = {}; render([]); });
  });

  function cpTxt(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t);
    else { var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); } catch (e) {} ta.remove(); }
  }
  function showFS(m, er) { formStatusEl.textContent = m; formStatusEl.className = 'fs' + (er ? ' er' : ''); }

  /* Manual add */
  document.getElementById('addBtn').addEventListener('click', function () {
    var devId = fD.value.trim();
    var acts = fA.value.split(/[,&]/).map(function (s) { return s.trim(); }).filter(Boolean);
    if (!devId) { showFS('Device ID required.', true); return; }
    if (!acts.length) { showFS('Actions required.', true); return; }
    var ts = Date.now();
    var entry = {
      id: ts.toString(36) + '-' + Math.random().toString(36).slice(2, 8),
      ts: ts, iso: new Date(ts).toISOString(),
      qualId: fQ.value.trim() || null,
      qualUrl: fQ.value.trim() ? ORIGIN + '/admin/qualification/machinequalification/' + fQ.value.trim() + '/change/' : null,
      deviceId: devId, deviceUrl: DDEV + '/backend/devices/' + devId + '/summary',
      whmcsTicket: fW.value.trim(), status: fS.value, phase: fP.value,
      actions: acts, open: false
    };
    getEntries().then(function (es) {
      es.push(entry);
      saveEntries(es).then(function () {
        showFS('Added at ' + fmtTime(ts) + '.');
        clrForm(false);
        render(es);
        showView('entries');
      });
    });
  });

  function clrForm(a) {
    fQ.value = ''; fD.value = ''; fW.value = '';
    fS.value = fS.options[0].value; fP.value = fP.options[0].value;
    fA.value = ''; saveF();
    if (a) showFS('Fields cleared.');
  }
  function saveF() {
    var p = {}; p[FK] = {
      qualid: fQ.value.trim(), deviceid: fD.value.trim(), whmcs: fW.value.trim(),
      status: fS.value, phase: fP.value, actions: fA.value
    }; sSet(p);
  }
  function restF(s) {
    if (!s) return;
    if (s.qualid != null) fQ.value = s.qualid;
    if (s.deviceid != null) fD.value = s.deviceid;
    if (s.whmcs != null) fW.value = s.whmcs;
    if (s.status) fS.value = s.status;
    if (s.phase) fP.value = s.phase;
    if (s.actions != null) {
      fA.value = s.actions;
      if (fA.selectedIndex < 0) fA.selectedIndex = 0;
    }
  }
  [fQ, fD, fW].forEach(function (el) { el.addEventListener('input', saveF); });
  [fS, fP, fA].forEach(function (el) { el.addEventListener('change', saveF); });
  document.getElementById('clearFieldsBtn').addEventListener('click', function () { clrForm(true); });
  fS.value = fS.options[0].value;
  fP.value = fP.options[0].value;

  /* Bulk import — paste box, preview, validated import. Pure parsers have no
     DOM dependencies so they can be statically tested; storage uses the same
     getEntries/saveEntries/render path as Add Entry. */
  var bText = document.getElementById('b-text');
  var bErr = document.getElementById('b-err');
  var bSummary = document.getElementById('b-summary');
  var bPreview = document.getElementById('b-preview');
  var bImportBtn = document.getElementById('b-import');
  var bStatus = document.getElementById('b-status');
  var bSkipDup = document.getElementById('b-skipdup');
  var bParsed = [];

  function biStripMd(s) {
    return String(s == null ? '' : s).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
  }
  function biIsBlank(s) {
    var v = biStripMd(s);
    return !v || v === '-' || v === '\u2014' || v.toLowerCase() === 'n/a';
  }
  function biNorm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[\s_\-./]+/g, ''); }

  var BI_PHASES = ['pending', 'detect hardware', 'disk wipe', 'health check', 'hhr'];
  var BI_KNOWN_STATUS = ['pending', 'inprogress', 'completed', 'escalated', 'failed to start', 'failed', 'awaiting rerun', 'no disks', 'blocked'];
  var BI_KNOWN_ESCTO = ['no escalation', 'midhun', 'shift manager', 'onsite'];
  var BI_KNOWN_STATUS_N = BI_KNOWN_STATUS.map(biNorm);
  var BI_PHASES_N = BI_PHASES.map(biNorm);
  var BI_ESCTO_N = BI_KNOWN_ESCTO.map(biNorm);

  function biParseEsc(v) {
    if (v == null) return null;
    var k = biNorm(v);
    if (!k || k === 'na') return null;
    if (k === 'yes' || k === 'y') return 'yes';
    if (k === 'no' || k === 'n' || k === 'noescalation') return 'no';
    return undefined;
  }
  function biParseSuccess(v) {
    if (v == null) return null;
    var k = biNorm(v);
    if (!k || k === 'na') return null;
    if (k === 'yes' || k === 'y' || k === '\u2713yes' || k === 'pass') return 'pass';
    if (k === 'no' || k === 'n' || k === '\u2717no' || k === 'fail') return 'fail';
    return undefined;
  }
  function biParseFlag(v) {
    if (v == null) return undefined;
    var k = biNorm(v);
    if (!k || k === 'na') return undefined;
    if (k === 'yes' || k === 'y' || k === '\u2713yes') return true;
    if (k === 'no' || k === 'n' || k === '\u2717no') return false;
    return undefined;
  }
  function biParseTime(v) {
    if (v == null || biIsBlank(v)) return { ts: null, warn: null };
    var s = biStripMd(v);
    var d = new Date(s.replace(' ', 'T'));
    if (!isNaN(d.getTime())) return { ts: d.getTime(), warn: null };
    var m = s.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2})/);
    if (m) {
      d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]));
      if (!isNaN(d.getTime())) return { ts: d.getTime(), warn: null };
    }
    return { ts: null, warn: 'Unparseable Time "' + s + '" — entry will use import time' };
  }

  /* Format B: label-based full records. Next "Qual ID:" starts a new record. */
  function biField(chunk, name) {
    var m = chunk.match(new RegExp('^\\s*' + name + '\\s*:(.*)$', 'im'));
    return m ? biStripMd(m[1]) : null;
  }
  /* Note may span several lines: consume continuation lines until the next
     known field label or the end of the record chunk. */
  var BI_FULL_LABELS = ['Qual ID', 'Device ID', 'Ticket ID', 'Current phase', 'Current Status', 'Status', 'Escalation Required', 'Actions', 'Time', 'Success Criteria Met', 'ESC Flag Marked', 'Escalated To', 'Note'];
  function biIsFullLabel(l) {
    for (var k = 0; k < BI_FULL_LABELS.length; k++) {
      if (new RegExp('^\\s*' + BI_FULL_LABELS[k] + '\\s*:', 'i').test(l)) return true;
    }
    return false;
  }
  function biNoteField(chunk) {
    var lines = String(chunk).split(/\r?\n/);
    var start = -1;
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*Note\s*:/i.test(lines[i])) { start = i; break; }
    }
    if (start < 0) return null;
    var vals = [biStripMd(lines[start].replace(/^\s*Note\s*:/i, ''))];
    for (var j = start + 1; j < lines.length; j++) {
      if (biIsFullLabel(lines[j])) break;
      vals.push(String(lines[j]).replace(/\*/g, '').replace(/\s+/g, ' ').trim());
    }
    while (vals.length && vals[0] === '') vals.shift();
    while (vals.length && vals[vals.length - 1] === '') vals.pop();
    if (!vals.length) return null;
    return vals.join('\n');
  }
  function biIdUrl(raw) {
    var out = { id: null, url: null };
    if (raw == null) return out;
    var um = String(raw).match(/(https?:\/\/[^\s)]+)/);
    if (um) out.url = um[1];
    var nm = String(raw).replace(/https?:\/\/\S+/g, ' ').match(/\d+/);
    if (nm) out.id = nm[0];
    return out;
  }
  function biParseFullChunk(chunk) {
    var rec = { format: 'B', warnings: [], errors: [] };
    var q = biIdUrl(biField(chunk, 'Qual ID'));
    if (!q.id) rec.errors.push('Qual ID number not found');
    else {
      rec.qualId = q.id;
      rec.qualUrl = q.url || (ORIGIN + '/admin/qualification/machinequalification/' + q.id + '/change/');
    }
    var dv = biIdUrl(biField(chunk, 'Device ID'));
    if (!dv.id) rec.errors.push('Device ID number not found');
    else {
      rec.deviceId = dv.id;
      rec.deviceUrl = dv.url || (DDEV + '/backend/devices/' + dv.id + '/summary');
    }
    var tick = biField(chunk, 'Ticket ID');
    rec.whmcsTicket = (tick != null && !biIsBlank(tick)) ? tick : '';
    if (!rec.whmcsTicket) rec.warnings.push('Ticket ID missing — left blank, not inferred');
    var ph = biField(chunk, 'Current phase');
    rec.phase = ph || '';
    if (!ph) rec.warnings.push('Current phase missing');
    else if (BI_PHASES.indexOf(ph.toLowerCase()) === -1) rec.warnings.push('Unknown phase "' + ph + '" — kept as-is');
    var st = biField(chunk, 'Current Status');
    if (st == null) st = biField(chunk, 'Status');
    rec.status = st || '';
    if (!st) rec.warnings.push('Status missing');
    else if (BI_KNOWN_STATUS_N.indexOf(biNorm(st)) === -1) rec.warnings.push('Unknown status "' + st + '" — kept as-is');
    var escv = biField(chunk, 'Escalation Required');
    if (escv == null || biIsBlank(escv)) rec.escalation = null;
    else {
      var e = biParseEsc(escv);
      if (e === undefined) { rec.escalation = null; rec.warnings.push('Unrecognized Escalation Required "' + escv + '" — treated as unknown'); }
      else rec.escalation = e;
    }
    var acts = biField(chunk, 'Actions');
    rec.actions = (acts != null && !biIsBlank(acts)) ? acts.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : [];
    if (!rec.actions.length) rec.warnings.push('Actions missing — stored empty');
    var tm = biField(chunk, 'Time');
    var pt = biParseTime(tm);
    if (pt.ts) rec.ts = pt.ts;
    else {
      if (tm != null && !biIsBlank(tm)) rec.warnings.push('Unparseable Time "' + tm + '" — entry will use import time');
      else rec.warnings.push('Time missing — entry will use import time');
    }
    var sc = biField(chunk, 'Success Criteria Met');
    if (sc == null || biIsBlank(sc)) rec.result = null;
    else {
      var r = biParseSuccess(sc);
      if (r === undefined) { rec.result = null; rec.warnings.push('Unrecognized Success Criteria "' + sc + '" — treated as N/A'); }
      else rec.result = r;
    }
    var fl = biField(chunk, 'ESC Flag Marked');
    if (fl != null && !biIsBlank(fl)) {
      var f = biParseFlag(fl);
      if (f === undefined) rec.warnings.push('Unrecognized ESC Flag Marked "' + fl + '" — left unset');
      else rec.flagMarked = f;
    }
    var et = biField(chunk, 'Escalated To');
    if (et != null && !biIsBlank(et)) {
      rec.escalatedTo = et;
      if (BI_KNOWN_ESCTO.indexOf(et.toLowerCase()) === -1) rec.warnings.push('Unknown Escalated To "' + et + '" — kept as-is');
    }
    var note = biNoteField(chunk);
    if (note != null && !biIsBlank(note)) rec.note = note;
    return rec;
  }
  function biParseFull(text) {
    var idx = [];
    var re = /qual\s*id\s*:/gi;
    var m;
    while ((m = re.exec(text)) !== null) idx.push(m.index);
    if (!idx.length) return [];
    var out = [];
    for (var i = 0; i < idx.length; i++) {
      out.push(biParseFullChunk(text.slice(idx[i], i + 1 < idx.length ? idx[i + 1] : text.length)));
    }
    return out;
  }

  /* Format A: numbered compact rows. A seq line is a short number followed by a
     numeric ID line and a phase line — IDs alone never qualify as seq numbers.
     Newer rows may carry a leading Ticket ID line (#12345) between the seq
     number and the Device ID; the note runs from after the flag/escalated-to
     fields to the final Success line and may span several lines. */
  function biNextNonBlank(lines, i) {
    var nxt = [];
    for (var j = i + 1; j < lines.length && nxt.length < 3; j++) {
      if (lines[j] !== '') nxt.push(lines[j]);
    }
    return nxt;
  }
  function biIsTicketLine(l) { return /^#\S+$/.test(l); }
  function biIsSeqAt(lines, i) {
    if (!/^\d+$/.test(lines[i])) return false;
    var nxt = biNextNonBlank(lines, i);
    if (nxt.length < 2) return true;
    // seq, device, phase (original rows without a ticket line). Device lines
    // can never match: their followers are a ticket line or a phase line,
    // never a bare number followed by a phase.
    if (/^\d+$/.test(nxt[0]) && BI_PHASES.indexOf(nxt[1].toLowerCase()) !== -1) return true;
    if (nxt.length < 3) return false;
    // seq, ticket, device, phase
    if (biIsTicketLine(nxt[0]) && /^\d+$/.test(nxt[1]) && BI_PHASES.indexOf(nxt[2].toLowerCase()) !== -1) return true;
    // seq, device, ticket, phase
    if (/^\d+$/.test(nxt[0]) && biIsTicketLine(nxt[1]) && BI_PHASES.indexOf(nxt[2].toLowerCase()) !== -1) return true;
    // seq, bare-numeric ticket, device, phase
    if (/^\d+$/.test(nxt[0]) && /^\d+$/.test(nxt[1]) && BI_PHASES.indexOf(nxt[2].toLowerCase()) !== -1) return true;
    return false;
  }
  function biParseCompact(text) {
    var lines = String(text).split(/\r?\n/).map(function (l) {
      return String(l).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
    });
    var seqAt = [];
    for (var i = 0; i < lines.length; i++) {
      if (lines[i] !== '' && biIsSeqAt(lines, i)) seqAt.push(i);
    }
    if (!seqAt.length) return [];
    var out = [];
    for (var s = 0; s < seqAt.length; s++) {
      // Blanks are kept: interior blank lines inside a multiline note survive.
      var fields = [];
      var end = s + 1 < seqAt.length ? seqAt[s + 1] : lines.length;
      for (var j = seqAt[s] + 1; j < end; j++) {
        fields.push(lines[j]);
      }
      out.push(biParseCompactFields(fields));
    }
    return out;
  }
  function biParseCompactFields(f) {
    var rec = { format: 'A', warnings: [], errors: [] };
    rec.warnings.push('Compact row has no Qual ID — numeric value mapped to Device ID only');
    // Non-blank line index; positional head parsing skips blank separators.
    var nb = [];
    for (var k = 0; k < f.length; k++) if (f[k] !== '') nb.push(k);
    function nth(n) { return n < nb.length ? f[nb[n]] : null; }
    var pos = 0;
    var hasTicket = false;
    // Optional leading Ticket ID: explicit "#12345", or two leading numerics
    // ahead of a phase line (original rows never have that shape).
    var v0 = nth(0), v1 = nth(1), v2 = nth(2);
    if (v0 != null && biIsTicketLine(v0)) {
      rec.whmcsTicket = v0;
      pos = 1;
      hasTicket = true;
    } else if (v0 != null && /^\d+$/.test(v0) && v1 != null && biIsTicketLine(v1) &&
               v2 != null && BI_PHASES.indexOf(v2.toLowerCase()) !== -1) {
      // Device-first rows: device, ticket, phase.
      rec.deviceId = v0;
      rec.deviceUrl = DDEV + '/backend/devices/' + v0 + '/summary';
      rec.whmcsTicket = v1;
      pos = 2;
      hasTicket = true;
    } else if (v0 != null && /^\d+$/.test(v0) && v1 != null && /^\d+$/.test(v1) &&
               v2 != null && BI_PHASES.indexOf(v2.toLowerCase()) !== -1) {
      rec.whmcsTicket = v0;
      pos = 1;
      hasTicket = true;
      rec.warnings.push('First numeric value "' + v0 + '" treated as Ticket ID — verify in preview');
    } else {
      rec.whmcsTicket = '';
      rec.warnings.push('Ticket ID not present in compact row — left blank, not inferred');
    }
    var dv = null;
    if (rec.deviceId == null) {
      // Device-first rows already set deviceId above; the shared read below
      // covers classic, ticket-first and bare-ticket rows.
      dv = nth(pos);
      pos++;
      if (dv == null || !/^\d+$/.test(dv)) {
        rec.errors.push('Device ID missing or non-numeric' + (dv != null ? ' (found "' + dv + '")' : ''));
      } else {
        rec.deviceId = dv;
        rec.deviceUrl = DDEV + '/backend/devices/' + dv + '/summary';
      }
    }
    var ph = nth(pos);
    pos++;
    rec.phase = ph || '';
    if (ph == null) rec.warnings.push('Phase missing');
    else if (BI_PHASES.indexOf(ph.toLowerCase()) === -1) rec.warnings.push('Unknown phase "' + ph + '" — kept as-is');
    var st = nth(pos);
    if (st != null && !biIsBlank(st) && biParseEsc(st) !== undefined &&
        BI_KNOWN_STATUS_N.indexOf(biNorm(st)) === -1) {
      // A Yes/No value in the status slot means status is absent and this
      // line is the Escalation value — leave pos so esc parsing takes it.
      rec.status = '';
      rec.warnings.push('Status missing');
    } else {
      pos++;
      rec.status = st || '';
      if (st == null) rec.warnings.push('Status missing');
      else if (!biIsBlank(st) && BI_KNOWN_STATUS_N.indexOf(biNorm(st)) === -1) rec.warnings.push('Unknown status "' + st + '" — kept as-is');
    }
    var escline = nth(pos);
    pos++;
    if (escline != null && !biIsBlank(escline)) {
      var e = biParseEsc(escline);
      if (e === undefined) { rec.escalation = null; rec.warnings.push('Unrecognized escalation "' + escline + '" — treated as unknown'); }
      else rec.escalation = e;
    } else rec.escalation = null;
    // Remaining lines. Classic rows (no ticket line) keep the legacy fixed
    // slots: flag, escalated-to, single-line note, success. Ticket rows use
    // semantic classification: known escalated-to names and Yes/No flags fill
    // their slots in any order, the trailing Success line closes the record,
    // and every other line is note content joined with newlines.
    var rest = [];
    for (var n = pos; n < nb.length; n++) rest.push(f[nb[n]]);
    rec.result = null;
    if (!hasTicket) {
      if (rest.length > 0 && !biIsBlank(rest[0])) {
        var fl0 = biParseFlag(rest[0]);
        if (fl0 === undefined) rec.warnings.push('Unrecognized flag value "' + rest[0] + '" — left unset');
        else rec.flagMarked = fl0;
      }
      if (rest.length > 1 && !biIsBlank(rest[1])) {
        rec.escalatedTo = rest[1];
        if (BI_KNOWN_ESCTO.indexOf(rest[1].toLowerCase()) === -1) rec.warnings.push('Unknown Escalated To "' + rest[1] + '" — kept as-is');
      }
      if (rest.length > 2 && !biIsBlank(rest[2])) rec.note = rest[2];
      if (rest.length > 3 && !biIsBlank(rest[3])) {
        var sc0 = biParseSuccess(rest[3]);
        if (sc0 === undefined) rec.warnings.push('Unrecognized success value "' + rest[3] + '" — treated as N/A');
        else rec.result = sc0;
      }
      if (rest.length > 4) rec.warnings.push((rest.length - 4) + ' extra line(s) ignored');
    } else {
      var ridx = [];
      for (var m = 0; m < rest.length; m++) ridx.push(m);
      while (ridx.length && biIsBlank(rest[ridx[ridx.length - 1]])) ridx.pop();
      if (ridx.length) {
        var sl = rest[ridx[ridx.length - 1]];
        var sct = biParseSuccess(sl);
        if (sct !== undefined) {
          rec.result = sct;
          ridx.pop();
        }
      }
      var noteIdx = [];
      for (var q = 0; q < ridx.length; q++) {
        var t = rest[ridx[q]];
        if (biIsBlank(t)) continue;
        if (rec.escalatedTo == null && BI_KNOWN_ESCTO.indexOf(t.toLowerCase()) !== -1) {
          rec.escalatedTo = t;
          continue;
        }
        var flq = biParseFlag(t);
        if (flq !== undefined && rec.flagMarked == null) {
          rec.flagMarked = flq;
          continue;
        }
        if ((rec.escalatedTo != null && BI_KNOWN_ESCTO.indexOf(t.toLowerCase()) !== -1) ||
            (flq !== undefined && rec.flagMarked != null)) {
          rec.warnings.push('Extra line "' + t + '" kept in note');
        }
        noteIdx.push(ridx[q]);
      }
      if (noteIdx.length) {
        // Raw slice across the note span keeps interior blank lines.
        var rawNb = [];
        for (var u = pos; u < nb.length; u++) rawNb.push(nb[u]);
        var a = rawNb[noteIdx[0]], b = rawNb[noteIdx[noteIdx.length - 1]];
        rec.note = f.slice(a, b + 1).join('\n');
        rec.warnings.push('Note captured (' + noteIdx.length + ' line(s)) — verify in preview');
      }
    }
    rec.actions = [];
    rec.warnings.push('Actions not present in compact row — stored empty');
    rec.qualId = null;
    rec.qualUrl = null;
    return rec;
  }

  /* Format D: single-line tab/space-separated rows:
     seq device phase status esc flag escTo [note] success. Multi-word values
     (Detect Hardware, Failed to Start, Shift Manager) are matched greedily
     against the known vocabularies; the note is whatever words remain. */
  function biLongestMatch(toks, i, normList, maxWords) {
    for (var w = maxWords; w >= 1; w--) {
      if (i + w - 1 >= toks.length) continue;
      var raw = toks.slice(i, i + w).join(' ');
      if (normList.indexOf(biNorm(raw)) !== -1) return { text: raw, next: i + w };
    }
    return null;
  }
  function biIsDLine(toks) {
    if (toks.length < 8) return false;
    if (!/^\d+$/.test(toks[0]) || !/^\d+$/.test(toks[1])) return false;
    return biLongestMatch(toks, 2, BI_PHASES_N, 2) !== null;
  }
  function biParseDRow(toks) {
    var rec = { format: 'D', warnings: [], errors: [] };
    rec.warnings.push('Row has no Qual ID — numeric value mapped to Device ID only');
    var i = 1;
    rec.deviceId = toks[1];
    rec.deviceUrl = DDEV + '/backend/devices/' + toks[1] + '/summary';
    i = 2;
    var pm = biLongestMatch(toks, i, BI_PHASES_N, 2);
    if (!pm) {
      rec.phase = toks[i] || '';
      rec.warnings.push('Unknown phase "' + toks[i] + '" — kept as-is');
      i++;
    } else { rec.phase = pm.text; i = pm.next; }
    var sm = i < toks.length ? biLongestMatch(toks, i, BI_KNOWN_STATUS_N, 3) : null;
    if (sm) { rec.status = sm.text; i = sm.next; }
    else if (i < toks.length && !biIsBlank(toks[i]) && biParseEsc(toks[i]) !== undefined) {
      rec.status = '';
      rec.warnings.push('Status missing');
    } else {
      var sv = i < toks.length ? toks[i] : null;
      rec.status = sv || '';
      if (sv == null) rec.warnings.push('Status missing');
      else if (!biIsBlank(sv)) rec.warnings.push('Unknown status "' + sv + '" — kept as-is');
      i++;
    }
    if (i < toks.length && !biIsBlank(toks[i])) {
      var ev = biParseEsc(toks[i]);
      if (ev === undefined) { rec.escalation = null; rec.warnings.push('Unrecognized escalation "' + toks[i] + '" — treated as unknown'); }
      else rec.escalation = ev;
    } else rec.escalation = null;
    if (i < toks.length) i++;
    if (i < toks.length && !biIsBlank(toks[i])) {
      var fv = biParseFlag(toks[i]);
      if (fv === undefined) rec.warnings.push('Unrecognized flag value "' + toks[i] + '" — left unset');
      else rec.flagMarked = fv;
    }
    if (i < toks.length) i++;
    var em = i < toks.length ? biLongestMatch(toks, i, BI_ESCTO_N, 2) : null;
    if (em) { rec.escalatedTo = em.text; i = em.next; }
    else if (i < toks.length && !biIsBlank(toks[i])) {
      rec.escalatedTo = toks[i];
      rec.warnings.push('Unknown Escalated To "' + toks[i] + '" — kept as-is');
      i++;
    } else if (i < toks.length) i++;
    var tail = toks.slice(i);
    while (tail.length && biIsBlank(tail[tail.length - 1])) tail.pop();
    rec.result = null;
    if (tail.length) {
      var sc = biParseSuccess(tail[tail.length - 1]);
      if (sc !== undefined) { rec.result = sc; tail.pop(); }
    }
    var nt = [];
    for (var q = 0; q < tail.length; q++) if (!biIsBlank(tail[q])) nt.push(tail[q]);
    if (nt.length) {
      rec.note = nt.join(' ');
      rec.warnings.push('Note captured — verify in preview');
    }
    rec.actions = [];
    rec.warnings.push('Actions not present in row — stored empty');
    rec.whmcsTicket = '';
    rec.warnings.push('Ticket ID not present in row — left blank, not inferred');
    rec.qualId = null;
    rec.qualUrl = null;
    return rec;
  }
  function biParseD(text) {
    var rows = [];
    var lines = String(text).split(/\r?\n/);
    for (var l = 0; l < lines.length; l++) {
      var clean = String(lines[l]).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
      if (!clean) continue;
      rows.push(clean.split(' '));
    }
    var any = false;
    for (var k = 0; k < rows.length; k++) {
      if (biIsDLine(rows[k])) { any = true; break; }
    }
    if (!any) return null;
    var out = [];
    for (var j = 0; j < rows.length; j++) {
      if (biIsDLine(rows[j])) out.push(biParseDRow(rows[j]));
      else {
        var bad = { format: 'D', warnings: [], errors: [] };
        bad.errors.push('Not a table row: expected "seq device phase status esc flag escTo [note] success"');
        out.push(bad);
      }
    }
    return out;
  }

  /* Format C: tabular copy headed by "Qual ID Device ID Ticket ID" with one
     whitespace-separated triple per line. Column meaning comes from the
     header, never from position guessing. */
  function biParseTableRow(line) {
    var rec = { format: 'C', warnings: [], errors: [] };
    var toks = line.split(' ');
    if (toks.length !== 3) {
      rec.errors.push('Expected 3 columns "Qual ID Device ID Ticket ID" (found ' + toks.length + ')');
      return rec;
    }
    if (!/^\d+$/.test(toks[0])) rec.errors.push('Qual ID not numeric (found "' + toks[0] + '")');
    else {
      rec.qualId = toks[0];
      rec.qualUrl = ORIGIN + '/admin/qualification/machinequalification/' + toks[0] + '/change/';
    }
    if (!/^\d+$/.test(toks[1])) rec.errors.push('Device ID not numeric (found "' + toks[1] + '")');
    else {
      rec.deviceId = toks[1];
      rec.deviceUrl = DDEV + '/backend/devices/' + toks[1] + '/summary';
    }
    if (!/\d/.test(toks[2])) rec.errors.push('Ticket ID has no digits (found "' + toks[2] + '")');
    else rec.whmcsTicket = toks[2];
    if (rec.errors.length) return rec;
    rec.phase = '';
    rec.status = '';
    rec.escalation = null;
    rec.actions = [];
    rec.warnings.push('Phase/Status/Escalation not in table — left blank, filled as Auto at Hashroot');
    rec.warnings.push('Actions not present in table — stored empty');
    return rec;
  }
  function biParseTable(text) {
    var lines = String(text).split(/\r?\n/).map(function (l) {
      return String(l).replace(/\*/g, '').replace(/\s+/g, ' ').trim();
    });
    var head = -1;
    for (var i = 0; i < lines.length; i++) {
      if (/^\s*qual\s*id\s+device\s*id\s+ticket\s*id/i.test(lines[i])) { head = i; break; }
    }
    if (head < 0) return null;
    var out = [];
    for (var j = head + 1; j < lines.length; j++) {
      if (lines[j] === '') continue;
      out.push(biParseTableRow(lines[j]));
    }
    return out;
  }

  function biAutoParse(text) {
    var full = biParseFull(text);
    if (full.length) return { format: 'B', recs: full };
    var tab = biParseTable(text);
    if (tab) return { format: 'C', recs: tab };
    var tsv = biParseD(text);
    if (tsv) return { format: 'D', recs: tsv };
    var comp = biParseCompact(text);
    if (comp.length) return { format: 'A', recs: comp };
    return { format: null, recs: [] };
  }

  function biDupOf(rec, existing) {
    for (var j = 0; j < existing.length; j++) {
      var e = existing[j];
      if (!e) continue;
      if (String(e.deviceId || '') !== String(rec.deviceId || '')) continue;
      if (rec.qualId && e.qualId && String(rec.qualId) !== String(e.qualId)) continue;
      if (rec.whmcsTicket && e.whmcsTicket && rec.whmcsTicket !== e.whmcsTicket) continue;
      var rp = String(rec.phase || '').toLowerCase();
      var ep = String(e.phase || '').toLowerCase();
      if (rp && ep && rp !== ep) continue;
      return e;
    }
    return null;
  }

  function biToEntry(rec, usedIds) {
    var ts = rec.ts || Date.now();
    var id = ts.toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    while (usedIds[id]) {
      id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
    }
    usedIds[id] = true;
    var e = {
      id: id,
      ts: ts, iso: new Date(ts).toISOString(),
      qualId: rec.qualId || null,
      qualUrl: rec.qualUrl || null,
      deviceId: String(rec.deviceId),
      deviceUrl: rec.deviceUrl || (DDEV + '/backend/devices/' + rec.deviceId + '/summary'),
      whmcsTicket: rec.whmcsTicket || '',
      status: rec.status || '',
      phase: rec.phase || '',
      actions: rec.actions && rec.actions.length ? rec.actions.slice() : [],
      open: false
    };
    if (rec.escalation) e.escalation = rec.escalation;
    if (rec.result) e.result = rec.result;
    if (rec.flagMarked === true || rec.flagMarked === false) e.flagMarked = rec.flagMarked;
    if (rec.escalatedTo) e.escalatedTo = rec.escalatedTo;
    if (rec.note) e.note = rec.note;
    return e;
  }

  function biShowErr(m) {
    if (!m) { bErr.style.display = 'none'; bErr.textContent = ''; }
    else { bErr.style.display = 'block'; bErr.textContent = m; }
  }
  function biShowStatus(m, er) {
    if (!m) { bStatus.style.display = 'none'; bStatus.textContent = ''; bStatus.className = 'fs'; }
    else { bStatus.style.display = 'block'; bStatus.textContent = m; bStatus.className = 'fs' + (er ? ' er' : ''); }
  }

  function biRenderPreview(existing) {
    if (!bParsed.length) {
      bSummary.textContent = '';
      bPreview.className = 'bprev';
      bPreview.innerHTML = '';
      bImportBtn.disabled = true;
      return;
    }
    var nValid = 0, nBad = 0, nDup = 0;
    var seen = {};
    var html = '';
    for (var i = 0; i < bParsed.length; i++) {
      var r = bParsed[i];
      var bad = r.errors.length > 0;
      var dup = null;
      if (!bad) {
        dup = biDupOf(r, existing);
        var key = String(r.deviceId || '') + '|' + String(r.qualId || '') + '|' + (r.whmcsTicket || '') + '|' + String(r.phase || '').toLowerCase();
        if (!dup && seen[key]) dup = seen[key];
        seen[key] = r;
      }
      r._dup = !!dup;
      if (bad) nBad++;
      else { nValid++; if (dup) nDup++; }
      var cls = bad ? 'brow bad' : (r.warnings.length || dup ? 'brow wrn' : 'brow');
      if (dup && !bad) cls += ' dup';
      html += '<div class="' + cls + '"><b>#' + (i + 1) + '</b> ' +
        'Qual ' + esc(r.qualId || '-') + ' · Device ' + esc(r.deviceId || '-') +
        ' · Ticket ' + esc(r.whmcsTicket || '-') + '<br>Phase ' + esc(r.phase || '-') +
        ' · Status ' + esc(r.status || '-') + ' · Esc ' + esc(r.escalation || '-') +
        (bad ? '<br><span class="berr">Incomplete: ' + esc(r.errors.join('; ')) + '</span>'
          : '<br><span class="bok">Valid</span>') +
        (dup && !bad ? ' <span class="bwarn">· Possible duplicate</span>' : '') +
        (r.warnings.length ? '<br><span class="bwarn">' + esc(r.warnings.join('; ')) + '</span>' : '') +
        '</div>';
    }
    bSummary.textContent = 'Parsed ' + bParsed.length + ' · Valid ' + nValid + ' · Incomplete ' + nBad + ' · Possible duplicates ' + nDup;
    bPreview.className = 'bprev show';
    bPreview.innerHTML = html;
    bImportBtn.disabled = nValid === 0;
    bImportBtn.textContent = 'Import Valid Entries' + (nValid ? ' (' + nValid + ')' : '');
  }

  document.getElementById('b-parse').addEventListener('click', function () {
    biShowStatus(null);
    var t = bText.value;
    if (!t || !t.trim()) {
      biShowErr('Paste box is empty — nothing to parse.');
      bParsed = [];
      biRenderPreview([]);
      return;
    }
    var parsed = biAutoParse(t);
    if (!parsed.format) {
      biShowErr('Unsupported format — no "Qual ID:" records, table header, or numbered compact rows detected.');
      bParsed = [];
      biRenderPreview([]);
      return;
    }
    if (!parsed.recs.length) {
      biShowErr('Table header found but no data rows detected.');
      bParsed = [];
      biRenderPreview([]);
      return;
    }
    biShowErr(null);
    bParsed = parsed.recs;
    getEntries().then(function (es) { biRenderPreview(es || []); });
  });

  document.getElementById('b-cancel').addEventListener('click', function () { showView('entries'); });
  document.getElementById('b-clear').addEventListener('click', function () {
    bText.value = '';
    bParsed = [];
    biShowErr(null);
    biShowStatus(null);
    biRenderPreview([]);
  });

  bImportBtn.addEventListener('click', function () {
    biShowStatus(null);
    if (!bParsed.length) return;
    /* Re-read storage at commit time so entries created meanwhile survive. */
    getEntries().then(function (es) {
      var existing = Array.isArray(es) ? es : [];
      var usedIds = {};
      for (var k = 0; k < existing.length; k++) if (existing[k] && existing[k].id) usedIds[existing[k].id] = true;
      var fresh = existing.slice();
      var nImp = 0, nSkipBad = 0, nSkipDup = 0;
      var skipDup = bSkipDup.checked;
      for (var i = 0; i < bParsed.length; i++) {
        var r = bParsed[i];
        if (r.errors.length) { nSkipBad++; continue; }
        if (skipDup && biDupOf(r, fresh)) { nSkipDup++; continue; }
        fresh.push(biToEntry(r, usedIds));
        nImp++;
      }
      if (!nImp) {
        biShowStatus('Nothing imported (' + nSkipBad + ' incomplete, ' + nSkipDup + ' duplicates skipped).', true);
        return;
      }
      saveEntries(fresh).then(function () {
        biShowStatus('Imported ' + nImp + ' entr' + (nImp === 1 ? 'y' : 'ies') +
          ' (' + nSkipBad + ' incomplete, ' + nSkipDup + ' duplicates skipped).');
        bParsed = [];
        bText.value = '';
        biRenderPreview(fresh);
        render(fresh);
      }, function () {
        biShowStatus('Storage save failed — no entries were imported. Try again.', true);
      });
    });
  });

  sGet(TK).then(function (r) { applyTheme(r[TK] || 'dark'); });
  load();
})();
