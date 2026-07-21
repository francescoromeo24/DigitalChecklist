import type { Checklist, Task, User } from '../types';
import { checklistProgress, checklistStatus, taskFailed } from '../types';

function assigneeName(users: User[], id?: string): string {
  if (!id) return 'Unassigned';
  return users.find((u) => u.id === id)?.name ?? 'Unknown';
}

function progressBar(progress: number): string {
  const filled = Math.round(progress / 10);
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

function taskLine(task: Task, users: User[]): string {
  const parts: string[] = [`• ${task.title}`];
  if (task.kind === 'number' && task.value !== undefined) {
    parts.push(`— reading: ${task.value}${task.min !== undefined || task.max !== undefined ? ` (allowed ${task.min ?? '−∞'}–${task.max ?? '+∞'})` : ''}`);
  }
  if (task.assigneeId) parts.push(`— assigned to ${assigneeName(users, task.assigneeId)}`);
  if (task.completed && task.completedAt) {
    const who = task.completedBy ? users.find((u) => u.id === task.completedBy)?.name : undefined;
    parts.push(`— done${who ? ` by ${who}` : ''} on ${new Date(task.completedAt).toLocaleString()}`);
  }
  if (task.flagged) parts.push('⚑');
  if (task.note) parts.push(`\n    note: ${task.note}`);
  return parts.join(' ');
}

/** Structured plain-text report used for the email body. */
function summaryText(checklist: Checklist, users: User[]): string {
  const progress = checklistProgress(checklist);
  const done = checklist.tasks.filter((t) => t.completed && !taskFailed(t));
  const failed = checklist.tasks.filter((t) => taskFailed(t));
  const pending = checklist.tasks.filter((t) => !t.completed && !taskFailed(t));

  const lines: string[] = [
    '════════════════════════════════════',
    `  CHECKLIST REPORT — ${checklist.title.toUpperCase()}`,
    '════════════════════════════════════',
    '',
    `Date:      ${new Date().toLocaleString()}`,
    `Status:    ${checklistStatus(checklist).toUpperCase()}`,
    `Progress:  ${progressBar(progress)}  ${progress}%  (${checklist.tasks.filter((t) => t.completed).length} of ${checklist.tasks.length} tasks)`
  ];
  if (checklist.dueDate) {
    lines.push(`Due date:  ${new Date(checklist.dueDate).toLocaleDateString()}`);
  }
  if (checklist.signature) {
    lines.push(
      `Signed by: ${checklist.signature.name} on ${new Date(checklist.signature.signedAt).toLocaleString()}`
    );
  }

  if (failed.length > 0) {
    lines.push('', `⚠ FAILED CHECKS (${failed.length}) — need attention`, '────────────────────────────────');
    for (const t of failed) lines.push(taskLine(t, users));
  }
  if (pending.length > 0) {
    lines.push('', `○ OPEN TASKS (${pending.length})`, '────────────────────────────────');
    for (const t of pending) lines.push(taskLine(t, users));
  }
  if (done.length > 0) {
    lines.push('', `✔ COMPLETED (${done.length})`, '────────────────────────────────');
    for (const t of done) lines.push(taskLine(t, users));
  }

  lines.push('', '————', 'Sent from Digital Checklist');
  return lines.join('\n');
}

function downloadBlob(content: string, mime: string, filename: string): void {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function safeName(title: string): string {
  return title.replace(/[^\w-]+/g, '_');
}

function csvCell(value: unknown): string {
  const s = value === undefined || value === null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const exportService = {
  /** Structured export ready for CMMS / ERP import. */
  exportJson(checklist: Checklist, users: User[]): void {
    const payload = {
      source: 'digital-checklist',
      exportedAt: new Date().toISOString(),
      checklist: {
        ...checklist,
        tasks: checklist.tasks.map((t) => ({
          ...t,
          assigneeName: assigneeName(users, t.assigneeId),
          completedByName: t.completedBy
            ? users.find((u) => u.id === t.completedBy)?.name
            : undefined
        }))
      }
    };
    downloadBlob(
      JSON.stringify(payload, null, 2),
      'application/json',
      `${safeName(checklist.title)}_export.json`
    );
  },

  exportCsv(checklist: Checklist, users: User[]): void {
    const header = [
      'task', 'type', 'completed', 'result', 'value', 'min', 'max',
      'flagged', 'assignee', 'completed_by', 'completed_at', 'note'
    ];
    const rows = checklist.tasks.map((t) =>
      [
        t.title,
        t.kind ?? 'check',
        t.completed ? 'yes' : 'no',
        t.result ?? '',
        t.value ?? '',
        t.min ?? '',
        t.max ?? '',
        t.flagged ? 'yes' : 'no',
        assigneeName(users, t.assigneeId),
        t.completedBy ? users.find((u) => u.id === t.completedBy)?.name ?? '' : '',
        t.completedAt ?? '',
        t.note ?? ''
      ].map(csvCell).join(',')
    );
    downloadBlob(
      [header.join(','), ...rows].join('\n'),
      'text/csv',
      `${safeName(checklist.title)}_export.csv`
    );
  },

  downloadBackup(json: string): void {
    downloadBlob(
      json,
      'application/json',
      `digital-checklist-backup-${new Date().toISOString().slice(0, 10)}.json`
    );
  },

  async exportPdf(checklist: Checklist, users: User[]): Promise<void> {
    // jsPDF is large; load it only when a PDF is actually generated.
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    const pageHeight = doc.internal.pageSize.getHeight();
    const pageWidth = doc.internal.pageSize.getWidth();
    let y = 20;

    doc.setFillColor(47, 60, 72);
    doc.rect(0, 0, pageWidth, 14, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(10);
    doc.text('Digital Checklist — Summary', 10, 9);

    doc.setTextColor(47, 60, 72);
    doc.setFontSize(18);
    doc.text(checklist.title, 10, y);
    y += 8;

    const progress = checklistProgress(checklist);
    doc.setFontSize(11);
    doc.setTextColor(248, 43, 101);
    doc.text(
      `Progress: ${progress}% — ${checklist.tasks.filter((t) => t.completed).length}/${checklist.tasks.length} tasks completed`,
      10,
      y
    );
    y += 10;

    doc.setFontSize(11);
    for (const task of checklist.tasks) {
      if (y > pageHeight - 15) {
        doc.addPage();
        y = 20;
      }
      doc.setDrawColor(47, 60, 72);
      if (task.completed) {
        doc.setFillColor(248, 43, 101);
        doc.rect(10, y - 3.5, 4, 4, 'FD');
      } else {
        doc.rect(10, y - 3.5, 4, 4, 'D');
      }
      doc.setTextColor(task.completed ? 130 : 47, task.completed ? 140 : 60, task.completed ? 150 : 72);
      const label = `${task.title}${task.flagged ? '  (flagged)' : ''} — ${assigneeName(users, task.assigneeId)}`;
      const wrapped = doc.splitTextToSize(label, pageWidth - 30);
      doc.text(wrapped, 17, y);
      y += wrapped.length * 6 + 2;
    }

    doc.save(`${checklist.title.replace(/[^\w-]+/g, '_')}_summary.pdf`);
  },

  emailSummary(checklist: Checklist, users: User[]): void {
    const progress = checklistProgress(checklist);
    const failed = checklist.tasks.filter(taskFailed).length;
    const subject = encodeURIComponent(
      `Checklist report: ${checklist.title} — ${progress}% done${failed ? `, ${failed} failed` : ''}`
    );
    const body = encodeURIComponent(summaryText(checklist, users));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }
};
