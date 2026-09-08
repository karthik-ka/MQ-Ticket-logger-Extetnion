# MQ Worksheet Logger

Chrome extension (MV3) that logs machine-qualification actions on `api.fdcservers.io`
(e.g. Confirm BIOS, Confirm Boot Order, Retry Disk Wipe, Override, Cancel, Dispose) so the
entries can be reviewed and copied at end of shift. Auto-fills into the hashroot daily
worksheet via a one-click fill button on the hashroot page.

## Setup

No build step. Load unpacked via `chrome://extensions` → Developer mode → Load unpacked → select this folder.

## Architecture

- `manifest.json` — MV3 config; content scripts injected on qualification pages and hashroot worksheet
- `collect.js` — Scrapes the qualification change page, wires the Actions-area buttons,
  logs entries to `chrome.storage.local`, then lets the action navigation proceed
- `hashroot.js` — Content script for hashroot worksheet page; injects floating button with
  pause/resume, reads `mqEntries` directly, auto-fills "New EasyDCIM Entry" form two-scenario
  (Escalation No/Yes) with react-select support
- `popup.html` / `popup.js` — View entries, delete, copy one/all, add manual entries, per-entry
  Esc/Flag/EscTo/Status controls, theme toggle

## Storage Schema

All in `chrome.storage.local`:

### `mqEntries` (main entry list)

- `id` — unique id
- `ts` — first press time (epoch ms)
- `iso` — ISO string of the same time
- `qualId` — qualification id from the URL
- `qualUrl` — link to the change page
- `deviceId` / `deviceUrl` — EasyDCIM device id and its summary link
- `whmcsTicket` — WHMCS ticket (field label "WHMCS Ticket")
- `status` — Status field value (e.g. Pending, Failed)
- `phase` — Current phase field value (e.g. Disk Wipe, Health Check)
- `actions` — array of action labels pressed
- `open` — true while awaiting the partner confirmation button
- `result` — null, 'pass', or 'fail' (set via the table toggle)
- `note` — free-text note entered in the table
- `escalation` — null, 'yes', or 'no' (Esc toggle, decides Scenario 2 vs 1)
- `flagMarked` — boolean (Escalation Flag Marked?, Scenario 2)
- `escalatedTo` — string (Escalated To: No Escalation/Midhun/Shift Manager/Onsite)
- `statusOverride` — string (per-entry Current Status override; if empty/absent use auto-map)

> Note: The old `mqFillQueue` / `mqFillIndex` queue mechanism is obsolete. The hashroot
> fill button reads `mqEntries` directly.

## Capture & merge rule

- Every `<a class="button">` inside the `Actions` field-row of the General fieldset gets a
  click listener. On click the page is scraped (field-row label/value pairs), the entry is
  saved, then the original navigation continues (`window.location.assign(href)`).
- Merge happens **only** for the exact pair `Confirm BIOS` ↔ `Confirm Boot Order` on the
  same qual id: the first press creates an entry marked `open: true`; the second press of
  the partner appends to it and closes it. `ts` stays at the first press.
- Any other action always creates its own entry (`open: false`). Stray/duplicate entries
  can be deleted from the popup.

## Hashroot auto-fill

### Flow

1. `hashroot.js` injects a floating green "Fill Hashroot" button on the worksheet page
2. Clicking it reads all entries from `mqEntries` (no separate queue) and fills in a loop
3. Button shows progress "Filling N / M" with pause/resume (`⏸ Pause` / `▶ Resume`)
4. On completion it shows "Done ✓" then resets to idle

### Two scenarios (per entry)

- **Scenario 1 — Escalation = No:**
  Add Entry → EasyDCIM ID → Phase → Current Status → Escalation Required (No) → Success Criteria Met → Save. Remarks left blank.
- **Scenario 2 — Escalation = Yes:**
  Add Entry → EasyDCIM ID → Phase → Current Status → Escalation Required (Yes) → **wait for revealed fields** → MQ Ticket ID → Escalation Flag Marked? → Success Criteria Met → Escalated To → Escalation Reason → Save.

### Hashroot form fields

| Field | Type | Source |
|---|---|---|
| EasyDCIM ID | text input | `entry.deviceId` |
| Phase | react-select | `entry.phase` (Health Check → `HHR`) |
| Current Status | react-select | `entry.statusOverride` if set, else `mapCurrentStatus(entry)` |
| Escalation Required? | react-select | `entry.escalation` (yes→Yes, else No) |
| MQ Ticket ID (S2) | text input | `entry.whmcsTicket` |
| Escalation Flag Marked? (S2) | react-select | `entry.flagMarked` (true→Yes, false→No) |
| Success Criteria Met? | react-select | `entry.result` (pass→Yes, fail→No, null→N/A) |
| Escalated To (S2) | react-select | `entry.escalatedTo` |
| Escalation Reason (S2) | text input | `entry.note` |
| Remarks | textarea | left blank |

### Current Status auto-map (`mapCurrentStatus`)

- `Failed` / `Failed to Start` / `No Disks` → `Failed`
- `Pending` → `Pending`
- `Awaiting Rerun` → `Blocked`
- `Escalated` → `Escalated`
- `Completed` → `Completed`
- default → `InProgress`

Per-entry `statusOverride` takes precedence over the auto-map.

### Popup per-entry controls

| Column | Control | Storage field |
|---|---|---|
| CStatus | dropdown (Auto + hashroot options) | `statusOverride` |
| Esc | toggle cycle none→yes→no | `escalation` |
| Flag | checkbox | `flagMarked` |
| EscTo | dropdown (No Escalation/Midhun/Shift Manager/Onsite) | `escalatedTo` |

### React-select interaction

React-select requires `mousedown` (not `click`) on the `[class*="-control"]` element to open.
Options are found by polling `[role="option"]` elements. Matching priority: exact text → partial → first.

## Page parsing (tailwind/Django admin theme)

Qual record pages are Django admin change forms with per-record actions.
Relevant selectors:

- Qual ID: regex on `location.pathname` → `/admin/qualification/machinequalification/(\d+)/change/`
- Field values: `form .field-line` rows; each has a `<label>` (name) and a `.readonly`
  value div. "Status", "Current phase", "EasyDCIM Device ID" are read by label text.
- EasyDCIM Device ID href: `https://devices.fdcservers.net/backend/devices/{id}/summary`
- Actions area: the `.field-line` whose label is `Actions`; buttons are `a.button`.

## Debugging

- `collect.js` logs prefixed `[MQL]`
- `hashroot.js` logs prefixed `[MQL-Fill]`
- Check the browser console on the respective page, or open the popup and inspect entries.