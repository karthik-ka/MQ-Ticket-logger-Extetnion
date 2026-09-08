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
      pA.hidden = false;
    } else {
      pA.hidden = true;
      pE.hidden = false;
      load();
    }
  }
  addEntryBtn.addEventListener('click', function () { showView('add'); });
  backBtn.addEventListener('click', function () { showView('entries'); });

  var api = typeof browser !== 'undefined' ? browser : chrome;

  /* Storage */
  function sGet(k) { return api.storage.local.get(k); }
  function sSet(o) { return api.storage.local.set(o); }
  function getEntries() { return sGet(SK).then(function (r) { return Array.isArray(r[SK]) ? r[SK] : []; }); }
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

  function ddHtml(cur, opts, field) {
    var isStatus = field === 'statusOverride';
    var cls = isStatus ? statusCls(cur) : '';
    var stAttr = cls ? ' data-st="' + cls + '"' : '';
    var h = '<div class="dd" data-field="' + field + '" data-val="' + esc(cur || '') + '">';
    h += '<div class="dd-cur"' + stAttr + '>' + esc(cur || '--') + '</div>';
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
      rows += '<td class="ms">' + ddHtml(e.statusOverride || '', SOPTS, 'statusOverride') + '</td>';
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

      /* ESC Flag Marked (renamed from Flag) */
      rows += '<div><div class="det-label">ESC Flag Marked</div><input type="checkbox" class="fk" data-a="flag"' + (e.flagMarked ? ' checked' : '') + '></div>';

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
        if (id && confirm('Delete this entry?'))
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
              e.flagMarked = ev.target.checked;
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
        setTimeout(function () { api.tabs.create({ url: url, active: false }); }, i * 150);
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
    if (!confirm('Clear ALL entries?')) return;
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
    var acts = fA.value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
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
    if (s.actions != null) fA.value = s.actions;
  }
  [fQ, fD, fW, fA].forEach(function (el) { el.addEventListener('input', saveF); });
  [fS, fP].forEach(function (el) { el.addEventListener('change', saveF); });
  document.getElementById('clearFieldsBtn').addEventListener('click', function () { clrForm(true); });
  fS.value = fS.options[0].value;
  fP.value = fP.options[0].value;

  sGet(TK).then(function (r) { applyTheme(r[TK] || 'dark'); });
  load();
})();
