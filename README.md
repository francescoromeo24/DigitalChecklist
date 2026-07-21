# Digital Checklist

A progressive web application for managing operational checklists with role-based access control, file import, task assignment, and an AI assistant.

## Features

- **Checklist creation** – create checklists manually with any number of tasks.
- **File import** – import checklists from PDF, Excel (`.xlsx`), CSV, or plain text files; each line/row becomes a task.
- **Task management** – complete, flag, rename, assign, and delete individual tasks.
- **Bulk actions** – complete all, reset all, flag/unflag all, delete completed tasks.
- **Role-based access**
  - *Admin / Supervisor*: full lifecycle — create, import, export, assign tasks, manage members, monitor progress.
  - *Member*: sees only tasks assigned to them and can confirm/complete them; completion status (who and when) propagates back to the admin view.
- **Export** – generate a styled PDF summary or send an email summary of any checklist.
- **Overview dashboard** – landing view (above the checklist menu) with live stat tiles for work orders (assigned tasks), notifications, checklists, and tasks broken down by planned / scheduled / ongoing / completed, plus a notifications board classified by priority (high / medium / low) with mark-as-read actions.
- **Notifications** – generated automatically for assignments (to the member), completions and flags (to managers), and checklist creation/completion; members see theirs as a strip above their tasks.
- **Due dates & statuses** – checklists can have a due date; status (planned / scheduled / ongoing / completed) is derived from data and shown as chips.
- **AI assistant** – floating button (bottom-right) opens a chat panel that either generates checklists from free-text prompts or walks you through a guided conversation with multiple-choice quick replies (topic → number of tasks → due date → assignee) and persists the result to storage.
- **Check types & real-time data entry** – each task can be a checkbox, a pass/fail check, or a numeric reading with allowed min/max bounds, entered directly from phone or tablet.
- **Visual guides & multimedia** – tasks carry step-by-step instructions, reference links, photos (uploaded from camera or files, auto-downscaled), and notes to document defects or abnormal conditions.
- **Conditional logic** – a failed check (fail verdict or out-of-bounds reading) automatically opens the evidence area and prompts for a photo and note.
- **Automated escalation** – every new failure raises a high-priority alert for managers and auto-creates a flagged corrective work-order task in the checklist.
- **Step-by-step runner** – "Run" mode guides the operator through the checklist one task at a time with its instructions and input controls.
- **Digital signatures & timestamps** – every completion records who and exactly when; completed checklists can be signed off with a typed name and a drawn signature, stored with a timestamp for compliance.
- **Backup / device sync** – one-click backup of all data to a file and restore on any other device (a lightweight stand-in for cloud syncing, which would require a server).
- **CMMS/ERP-ready exports** – structured JSON and CSV exports of any checklist for import into maintenance or ERP systems.
- **Persistence & offline** – all data is stored locally in IndexedDB via `storageService`; the service worker keeps the app usable in areas with poor connectivity.
- **PWA** – installable, with offline support via a service worker.

## Accounts

On first launch the app shows a **setup screen** to create the administrator
account (name, email, password). After that, the admin adds supervisors and
members from **Manage members**, giving each an initial password (resettable
with the 🔑 button). Everyone then signs in with their email and password.

Passwords are hashed with PBKDF2-SHA256 (Web Crypto) and stored, with all
other data, locally in the browser via IndexedDB — there is no backend, so
accounts and data live per device. The sign-in screen has a "Reset this
device & start over" option that wipes local data and returns to setup.

## Color palette

| Color     | Hex       | Usage                                            |
| --------- | --------- | ------------------------------------------------ |
| Background| `#FFFFFF` | app background, cards                            |
| Pink      | `#F82B65` | primary buttons, progress, selection, AI button  |
| Blue grey | `#2F3C48` | text, secondary buttons, header accents          |

## Development

```bash
npm install
npm run dev      # start the dev server
npm run build    # type-check and build for production
npm run preview  # preview the production build
```

## Tech stack

React 18 · TypeScript · Vite · IndexedDB · pdfjs-dist · read-excel-file · jsPDF · Vitest
