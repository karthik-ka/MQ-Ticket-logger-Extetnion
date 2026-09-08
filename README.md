# MQ Worksheet Logger

Chrome extension (MV3) that logs machine-qualification actions from the FDC qualification
admin (`api.fdcservers.io/admin/qualification/machinequalification/...`) so entries can be
reviewed, copied, and auto-filled into the hashroot daily worksheet.

## What it does

1. On a qualification change page, it attaches a logger to **every button in the Actions
   area** (Confirm BIOS, Confirm Boot Order, Retry Disk Wipe, Override — Mark Available,
   Cancel Qualification, Dispose, etc. — any button present for that status/phase).
2. When you click such a button, it scrapes the page and logs:
   - **Qualification ID** (linked to the change page)
   - **EasyDCIM Device ID** (linked to the Devices summary)
   - **Status**
   - **Current phase**
   - **First press time**
   - the clicked action label(s)
3. The original button behaviour is preserved — the extension saves the entry, then
   navigates to the action URL as usual.

### Combine rule

`Confirm BIOS` + `Confirm Boot Order` (used when starting a qualification) are logged as a
**single entry**: the first press opens the entry, the second press of the pair appends and
closes it. The timestamp stays at the first press.

Every other action (Retry, Override, Cancel, Dispose, ...) is logged as its own separate
entry.

## Popup

Two tabs: **Entries** and **Add Entry**. Header has a light/dark theme toggle (remembered).

Entries (table view, chronological order):
- Columns: Qual (linked), Device (linked), WHMCS, Current Status (override dropdown), Esc (escalation toggle), Flag (checkbox), EscTo (dropdown), Phase, result toggle, note, trash (delete) icon
- Hover a Qual/Device to jump; rows awaiting their partner confirmation button are highlighted `(open)`
- **Result toggle**: click to cycle none → pass → fail → none (green checkmark for pass, red X for fail)
- **Esc toggle**: click to cycle none → Yes (red) → No (green) → none — decides Scenario 2 vs Scenario 1 in hashroot
- **Flag checkbox**: per-entry escalation flag (checked→YES / unchecked→NO), used in Scenario 2
- **EscTo dropdown**: Midhun / Shift Manager / Onsite / No Escalation — fills "Escalated To"
- **Current Status dropdown**: per-entry override (Auto = auto-mapped). If blank/auto, maps from FDC status
- **Note**: inline text field to add a short note per entry (saves on blur)
- **Copy All** and **Clear All** are small buttons at the bottom of the list

Add Entry (manual form):
- Same fields: qual ID, device ID, WHMCS ticket, **Status** and **Current phase** as dropdowns, actions free text
- Timestamp is set **automatically** to the current time when the entry is added
- Field values are remembered across popup close/reopen; use **Clear Fields** (bottom right) to reset

## Hashroot auto-fill

Navigate to the hashroot worksheet page and click the green **"Fill Hashroot"** floating
button (bottom-right). It reads all logged entries and fills them in a loop, showing progress
("Filling 2 / 5") with a pause/resume option, then "Done ✓" when finished.

Each entry is filled into the "New EasyDCIM Entry" form following the manual workflow:

**Scenario 1 — Escalation = No:**
EasyDCIM ID, Phase (Health Check → HHR), Current Status, Escalation Required (No), Success Criteria Met → Save (Remarks left blank).

**Scenario 2 — Escalation = Yes:**
After selecting Yes, waits for the revealed fields, then fills: MQ Ticket ID (WHMCS), Escalation Flag Marked? (Flag), Success Criteria Met, Escalated To (EscTo), Escalation Reason (Note), then Save.

### Field mapping

| Hashroot Field | Source |
|---|---|
| EasyDCIM ID | Device ID |
| Phase | Current phase (Health Check → HHR) |
| Current Status | Per-entry override, else auto-map (Failed→Failed, Pending→Pending, etc, default InProgress) |
| Escalation Required? | Esc toggle (yes→Yes, else No) |
| MQ Ticket ID (Scenario 2) | WHMCS ticket |
| Escalation Flag Marked? (Scenario 2) | Flag checkbox (checked→Yes) |
| Success Criteria Met? | Result: pass→Yes, fail→No, null→N/A |
| Escalated To (Scenario 2) | EscTo dropdown |
| Escalation Reason (Scenario 2) | Note |
| Remarks | left blank |

The form is filled and saved automatically. On completion the button shows "Done ✓".

## Install

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select this folder

## Storage

Entries live in `chrome.storage.local` under key `mqEntries`.

The hashroot fill button reads entries directly from `mqEntries` (no separate queue needed).

## Project layout

- `manifest.json` — MV3 config; injects `collect.js` on qualification pages and `hashroot.js` on hashroot worksheet
- `collect.js` — capture script
- `hashroot.js` — hashroot auto-fill content script
- `popup.html` / `popup.js` — log viewer + manual add