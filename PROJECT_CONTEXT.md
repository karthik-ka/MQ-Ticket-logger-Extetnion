# MQ Worksheet Logger — Full Project Context

> Generated 2026-09-04. Single source of truth for this codebase.

---

## 1. What This Is

Chrome extension (Manifest V3) that logs machine-qualification actions from the FDC admin panel (`api.fdcservers.io`) and auto-fills them into the Hashroot daily worksheet. Used by infrastructure/DC ops staff during shift handover.

**No build step.** Load unpacked via `chrome://extensions` → Developer mode → Load unpacked.

---

## 2. File Inventory

| File | Purpose | Lines |
|---|---|---|
| `manifest.json` | MV3 config; content script injection rules | 33 |
| `collect.js` | Content script on FDC qual pages; captures actions | 225 |
| `hashroot.js` | Content script on Hashroot worksheet; auto-fills entries | 475 |
| `popup.html` | Extension popup UI (table + form + theme) | 204 |
| `popup.js` | Popup logic (render, events, storage, dropdowns) | 330 |
| `icon16.png` / `icon48.png` / `icon128.png` | Extension icons | — |
| `icon.svg` | Source icon | — |
| `AGENTS.md` | AI agent instructions | 132 |
| `README.md` | User-facing docs | 99 |

---

## 3. Architecture

```
FDC Qual Page                    Hashroot Worksheet
     │                                │
     ▼                                ▼
 collect.js                       hashroot.js
 (scrape + log)                   (read + fill)
     │                                │
     └──────────┬─────────────────────┘
                ▼
       chrome.storage.local
           key: mqEntries
                │
                ▼
          popup.html/js
       (view / edit / copy)
```

### Content script injection (manifest.json)

```json
"content_scripts": [
  {
    "matches": ["https://api.fdcservers.io/admin/qualification/machinequalification/*/change*"],
    "js": ["collect.js"],
    "run_at": "document_idle"
  },
  {
    "matches": ["https://one.hashroot.com/employee/worksheet*"],
    "js": ["hashroot.js"],
    "run_at": "document_idle"
  }
]
```

---

## 4. Storage Schema (`chrome.storage.local`)

### `mqEntries` — Array of entry objects

| Field | Type | Description |
|---|---|---|
| `id` | string | Unique ID (`Date.now().toString(36) + '-' + random`) |
| `ts` | number | Epoch ms of first action press |
| `iso` | string | ISO string of same time |
| `qualId` | number | Qualification ID from URL |
| `qualUrl` | string | Full URL to qual change page |
| `deviceId` | string | EasyDCIM device ID |
| `deviceUrl` | string | Link to Devices summary |
| `whmcsTicket` | string | WHMCS ticket number |
| `status` | string | FDC Status field value |
| `phase` | string | FDC Current phase field value |
| `actions` | string[] | Array of action labels pressed |
| `open` | boolean | True while awaiting partner confirmation |
| `result` | string\|null | `'pass'`, `'fail'`, or `null` |
| `note` | string | Free-text note |
| `escalation` | string\|null | `'yes'`, `'no'`, or `null` |
| `flagMarked` | boolean | Escalation Flag Marked? |
| `escalatedTo` | string | `'No Escalation'` / `'Midhun'` / `'Shift Manager'` / `'Onsite'` |
| `statusOverride` | string | Per-entry Current Status override (empty = auto-map) |

### `mqFormState` — Saved form field values (persisted across popup close)

### `mqTheme` — `'dark'` or `'light'`

---

## 5. collect.js — FDC Page Capture

### What it does

1. On a qual change page, finds all `<a class="button">` inside the Actions field-row
2. Attaches click listeners (with `dataset.mqLogger` guard against double-wiring)
3. On click: scrapes page fields, saves entry, then navigates to the action URL

### Page parsing

- **Qual ID**: regex on `location.pathname` → `/admin/qualification/machinequalification/(\d+)/change/`
- **Field values**: `form .field-line` rows → `<label>` name + `.readonly` value
- **Device URL**: anchor inside `EasyDCIM Device ID` field, fallback to `https://devices.fdcservers.net/backend/devices/{id}/summary`
- **WHMCS Ticket**: read from `fields['WHMCS Ticket'].text`

### Merge rule

Only `Confirm BIOS` ↔ `Confirm Boot Order` on the same `qualId` merge:
- First press → entry with `open: true`, `actions: ['Confirm BIOS']`
- Second press (partner) → appends to same entry, sets `open: false`
- All other actions → standalone entry with `open: false`

### Logging

- `console.log` prefixed `[MQL]`
- Toast notification on save (green) or error (red)

### MutationObserver

- Watches for dynamically-added action buttons for 30 seconds after page load

---

## 6. hashroot.js — Hashroot Auto-Fill

### What it does

Injects a floating green **"Fill Hashroot"** button on `one.hashroot.com/employee/worksheet*`.
Clicking it reads all entries from `mqEntries` and fills them into the Hashroot form in a loop.

### Button states

| State | Text | Color | Behavior |
|---|---|---|---|
| idle | Fill Hashroot | `#16a34a` | Starts fill on click |
| filling | Filling N / M ⏸ Pause | `#16a34a` | Pauses on click |
| paused | Paused (N / M) ▶ Resume | `#d97706` | Resumes on click |
| done | Done ✓ (N filled) | `#0d5c1e` | Resets after 3s |
| empty | No entries found | `#6b7280` | Resets after 2s |

### Fill flow (per entry)

```
clickAdd() → fillEasyDcimId() → selectPhase() → selectCurrentStatus()
  → selectEscalationRequired() ──┬── Scenario 1: selectSuccessCriteria() → clickSave()
                                  └── Scenario 2: fillScenario2() → clickSave()
```

### Two scenarios

**Scenario 1 — Escalation = No:**
Add Entry → EasyDCIM ID → Phase → Current Status → Escalation Required (No) → Success Criteria Met → Save

**Scenario 2 — Escalation = Yes:**
Add Entry → EasyDCIM ID → Phase → Current Status → Escalation Required (Yes) → **wait for revealed fields** → MQ Ticket ID → Escalation Flag Marked? → Success Criteria Met → Escalated To → Escalation Reason → Save

### Field mapping

| Hashroot Field | Source | Type |
|---|---|---|
| EasyDCIM ID | `entry.deviceId` | text input |
| Phase | `entry.phase` (Health Check → HHR) | react-select |
| Current Status | `statusOverride` or `mapCurrentStatus(entry)` | react-select |
| Escalation Required? | `entry.escalation` (yes→Yes, else No) | react-select |
| MQ Ticket ID | `entry.whmcsTicket` | text input |
| Escalation Flag Marked? | `entry.flagMarked` (true→Yes, false→No) | react-select |
| Success Criteria Met? | `entry.result` (pass→Yes, fail→No, null→N/A) | react-select |
| Escalated To | `entry.escalatedTo` | react-select |
| Escalation Reason | `entry.note` | text input |
| Remarks | (left blank) | textarea |

### Current Status auto-map (`mapCurrentStatus`)

```
Failed / Failed to Start / No Disks  →  Failed
Pending                              →  Pending
Awaiting Rerun                       →  Blocked
Escalated                            →  Escalated
Completed                            →  Completed
(default)                            →  InProgress
```

Per-entry `statusOverride` takes precedence.

### React-select interaction

React-select requires `mousedown` (not `click`) on the `[class*="-control"]` element.
Options found by polling `[role="option"]` elements.
Matching priority: exact text → partial match → first option.
Fallback: types value into input and presses Enter.

### Pause/resume

- `waitWhilePaused()` checks a `paused` flag every 200ms
- Called before every form interaction in the fill flow

### Error handling

- `storageGet` wrapped in try-catch with `chrome.runtime.lastError` check
- Fill errors caught per-entry (does not stop the loop)
- Console logging prefixed `[MQL-Fill]`

---

## 7. popup.html / popup.js — Extension Popup

### Layout

```
┌─────────────────────────────────────────────┐
│ MQ Logger v2                         [☀/🌙] │  ← header
├─────────────────────────────────────────────┤
│ [Entries]  [Add Entry]                      │  ← tabs
├─────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────┐ │
│ │ <table> with 11 columns                 │ │  ← scrollable panel
│ │ Qual│Device│WHMCS│Phase│CStatus│Esc│... │ │
│ │ ...                                     │ │
│ └─────────────────────────────────────────┘ │
│                         [Copy All] [Clear]   │  ← bottom bar
└─────────────────────────────────────────────┘
```

### Table columns (11 total)

| Column | Class | Width | Content |
|---|---|---|---|
| Qual | `.cq` | 7% | Qual ID (linked) |
| Device | `.cd` | 7% | Device ID (linked) |
| WHMCS | `.cw` | 12% | WHMCS ticket |
| Phase | `.cp` | 12% | Current phase |
| CStatus | `.cs` | 13% | Custom dropdown (statusOverride) |
| Esc | `.ce` | 6% | Toggle button (none/yes/no) |
| SCMeet | `.cm` | 6% | Toggle button (none/pass/fail) |
| Flag | `.cf` | 4% | Checkbox (flagMarked) |
| EscTo | `.ct` | 13% | Custom dropdown (escalatedTo) |
| Note | `.cn` | 16% | Textarea (note) |
| (delete) | `.co` | auto | Trash icon button |

**Total: 96% fixed + 4% auto = 100%. Table uses `table-layout: fixed; width: 100%`.**

### Custom dropdowns (not native `<select>`)

Chrome extension popups clip native `<select>` at viewport boundary. All dropdowns use custom div-based implementation:

- `.dd` — wrapper (position: relative)
- `.dd-cur` — current value display (truncated with ellipsis)
- `.dd-list` — options list (absolute, z-index: 999)
- `.dd-item` — individual option
- `.up` class — opens upward when near bottom of popup (checked via `getBoundingClientRect`)

### Per-entry controls

| Control | Storage field | Behavior |
|---|---|---|
| CStatus dropdown | `statusOverride` | Auto / InProgress / Completed / Blocked / Failed / Escalated / Pending |
| Esc button | `escalation` | Cycle: null → 'yes' → 'no' → null |
| SCMeet button | `result` | Cycle: null → 'pass' → 'fail' → null |
| Flag checkbox | `flagMarked` | true / false |
| EscTo dropdown | `escalatedTo` | -- / No Escalation / Midhun / Shift Manager / Onsite |
| Note textarea | `note` | Saves on blur |

### Tabs

- **Entries** — shows table + Copy All + Clear All
- **Add Entry** — manual form (Qual ID, Device ID, WHMCS, Status, Phase, Actions)

### Add Entry form

- Fields: Qual ID, Device ID, WHMCS, Status (native select), Phase (native select), Actions (free text)
- Status options: pending, InProgress, Completed, Escalated, Failed to Start, Failed, Awaiting Rerun, No Disks
- Phase options: pending, Detect Hardware, Disk Wipe, Health Check, HHR
- Saves form state to `mqFormState` on every input/change
- Restores form state on popup open
- **Clear Fields** button resets form

### Theme

- Default: dark (`applyTheme(r[TK] || 'dark')`)
- Toggle saves to `mqTheme`
- CSS custom properties for all colors
- Light theme via `[data-theme="light"]`

---

## 8. CSS Architecture (popup.html)

### Theme variables

```css
:root {
  --bg: #0f1218;        /* deep charcoal background */
  --surface: #161b24;    /* card/panel surface */
  --surface2: #1c222c;   /* hover/secondary surface */
  --surface3: #232a36;   /* tertiary */
  --border: #2a3240;     /* default border */
  --border2: #353e4e;    /* secondary border */
  --text: #dce1e8;       /* primary text */
  --text2: #8b95a5;      /* secondary text */
  --text3: #5c6577;      /* muted text */
  --pri: #4a90e2;        /* primary accent (cool blue) */
  --ok: #3ab87a;         /* success (muted green) */
  --dng: #e05555;        /* error/escalation (muted red) */
  --wrn: #d4a03c;        /* warning (amber) */
}
```

### Layout

- Body: `width: 420px; max-height: 580px; overflow: hidden; display: flex; flex-direction: column`
- Header: `flex-shrink: 0`
- Tabs: `flex-shrink: 0`
- Panel: `flex: 1; overflow-y: auto` (vertical scroll only)
- Bottom bar: `flex-shrink: 0`

### Table

- `table-layout: fixed; width: 100%; border-collapse: collapse`
- Cells: `overflow-wrap: anywhere; word-break: break-word` (text wraps, never overflows)
- `overflow: hidden` on table element
- Hover: `tr:hover td { background: var(--surface2) }`
- Escalated rows: `tr.hi td { background: var(--wrn-dim) }`

### Overflow prevention

- `html, body`: `overflow-x: hidden`
- `.pnl`: `overflow-y: auto` (no `overflow-x`)
- `.dd-cur`: `overflow: hidden; text-overflow: ellipsis`
- `.ni` (textarea): `overflow: hidden`
- `.db` (delete): `overflow: hidden`
- `.dd-list`: `z-index: 999` (floats above table)

---

## 9. Page Selectors (FDC)

Qual pages are Django admin change forms. Relevant selectors:

| What | Selector |
|---|---|
| Qual ID | `location.pathname` regex: `/admin/qualification/machinequalification/(\d+)/change/` |
| Field rows | `form .field-line` |
| Field label | `.field-line label` |
| Field value | `.field-line .readonly` or `.field-line` (fallback) |
| Device link | Anchor inside `EasyDCIM Device ID` field-row |
| Actions area | `.field-line` where label text === "Actions" |
| Action buttons | `.field-line a.button` |

---

## 10. Page Selectors (Hashroot)

| What | Selector / Method |
|---|---|
| Labels | `document.querySelectorAll('label')` — match by `textContent.indexOf(labelText)` |
| Label container | `.closest('.col-md-3') \|\| .closest('.col-md-6') \|\| .parentElement` |
| React-select control | `.react-select [class*="-control"]` |
| React-select input | `.react-select input[id^="react-select-"]` |
| React-select options | `[role="option"]` or `[class*="-option"]` or `[id^="react-select-"][id*="-option-"]` |
| Add Entry button | `findButtonByText(['add entry', 'add new', '+ add'])` |
| Save button | `findButtonByText(['save entry', 'save'])` |

---

## 11. Version History

| Version | Changes |
|---|---|
| 1.x | Original table layout with purple gradient theme, native `<select>` dropdowns |
| 2.0.0 | Complete UI rebuild: card-based layout → reverted to table layout; dark graphite theme; custom dropdowns; responsive table with `table-layout: fixed`; WHMCS ticket capture; hashroot two-scenario fill; per-entry status override; escalation/flag/escalatedTo controls |

---

## 12. Known Issues / Notes

- **No automated tests.** All validation is code-level (syntax check, ID verification). No browser test available.
- **Native `<select>` clipping.** Chrome extension popups clip native `<select>` dropdowns at viewport boundary. All dropdowns use custom div-based implementation.
- **Dropdown overflow.** Custom dropdowns use `z-index: 999` to float above table. Panel has no `overflow-x: hidden` to avoid clipping them.
- **Form state persistence.** `mqFormState` saves on every input/change. If user closes popup mid-edit, values restore on next open.
- **MutationObserver timeout.** collect.js stops watching for new action buttons after 30 seconds.
- **hashroot.js delay.** 1500ms setTimeout before init, 1000ms between fill steps, 300ms option polling interval.

---

## 13. Development Notes

- **No build step.** Edit files directly, reload extension in `chrome://extensions`.
- **Testing:** Open popup, check console for `[MQL]` and `[MQL-Fill]` logs.
- **Backup:** `/home/krister/Projects/mq-worksheet-logger-backup-20260902/` — old version, do NOT load.
- **AGENTS.md** should be updated when architecture changes.
