import type { Checklist, ChecklistSource, Task } from '../types';
import { newId } from '../types';

// pdfjs and the spreadsheet reader are heavy; load them on demand so they
// stay out of the initial bundle and only download when a file is imported.
async function loadPdfjs() {
  const pdfjsLib = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
  return pdfjsLib;
}

/** Strip common list markers (bullets, numbering, checkboxes) from a raw line. */
function cleanLine(line: string): string {
  return line
    .replace(/^[\s ]*([-–—•·▪◦*]|\d+[.)]|[a-z][.)]|\[[ xX]?\]|☐|☑|✓)\s*/u, '')
    .trim();
}

/**
 * Normalize any imported line to the same shape as a manually created task:
 * single-spaced, no trailing separators, first letter capitalized.
 */
function normalizeTitle(raw: string): string {
  const cleaned = cleanLine(raw)
    .replace(/\s+/g, ' ')
    .replace(/[;:,.\s]+$/, '')
    .trim();
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

/** Lines that are page furniture rather than content (page numbers, "Page 2 of 3"). */
function isNoiseLine(line: string): boolean {
  return /^\d{1,4}$/.test(line.trim()) || /^page\s+\d+(\s+of\s+\d+)?$/i.test(line.trim());
}

/** Header rows from spreadsheets/CSVs ("Task, Description", "Attività", …). */
function isHeaderRow(title: string, instructions?: string): boolean {
  const t = title.toLowerCase();
  const heads = ['task', 'tasks', 'title', 'attività', 'attivita', 'item', 'step', 'description', 'descrizione', 'checklist'];
  return heads.includes(t) || (heads.includes(t) && !instructions);
}

interface RawTask {
  title: string;
  instructions?: string;
}

function toTasks(rows: RawTask[]): Task[] {
  return rows
    .map((r) => ({ title: normalizeTitle(r.title), instructions: r.instructions?.trim() || undefined }))
    .filter((r) => r.title.length > 2)
    .slice(0, 200)
    .map((r) => ({
      id: newId(),
      title: r.title,
      instructions: r.instructions,
      completed: false,
      flagged: false
    }));
}

function buildChecklist(
  title: string,
  source: ChecklistSource,
  createdBy: string,
  tasks: Task[]
): Checklist {
  const now = new Date().toISOString();
  return {
    id: newId(),
    title: normalizeTitle(title),
    source,
    createdBy,
    createdAt: now,
    updatedAt: now,
    tasks
  };
}

async function parsePdf(file: File): Promise<string[]> {
  const pdfjsLib = await loadPdfjs();
  const data = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const lines: string[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    // Group text items by their vertical position so each visual line becomes one task.
    const rows = new Map<number, { x: number; str: string }[]>();
    for (const item of content.items) {
      if (!('str' in item) || !item.str.trim()) continue;
      const y = Math.round(item.transform[5]);
      const x = item.transform[4];
      const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y;
      if (!rows.has(key)) rows.set(key, []);
      rows.get(key)!.push({ x, str: item.str });
    }
    const sorted = [...rows.entries()].sort((a, b) => b[0] - a[0]);
    for (const [, parts] of sorted) {
      const line = parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      if (line && !isNoiseLine(line)) lines.push(line);
    }
  }
  return lines;
}

/**
 * If the document opens with a heading (a line naming the checklist), use it as
 * the checklist title instead of importing it as a task.
 */
function splitHeading(lines: string[], fallbackTitle: string): { title: string; taskLines: string[] } {
  const first = lines[0] ? normalizeTitle(lines[0]) : '';
  const fallback = normalizeTitle(fallbackTitle);
  const looksLikeHeading =
    first.length > 0 &&
    first.length <= 60 &&
    (/check\s*list/i.test(first) ||
      first.toLowerCase() === fallback.toLowerCase() ||
      /^(procedure|procedura|report|modulo|form)\b/i.test(first));
  if (looksLikeHeading) {
    return { title: first, taskLines: lines.slice(1) };
  }
  return { title: fallback, taskLines: lines };
}

async function rowsFromSheet(file: File): Promise<RawTask[]> {
  const readXlsxFile = (await import('read-excel-file/browser')).default;
  const result = await readXlsxFile(file);
  // The reader returns [{ sheet, data }] per worksheet; use the first sheet's rows.
  const rows =
    Array.isArray(result) && result.length > 0 && !Array.isArray(result[0])
      ? result[0].data
      : (result as unknown as (string | number | boolean | Date | null)[][]);
  return rows
    .map((row) => {
      const cells = row
        .filter((cell) => cell !== null && cell !== undefined && `${cell}`.trim() !== '')
        .map((cell) => `${cell}`.trim());
      return { title: cells[0] ?? '', instructions: cells.slice(1).join(' — ') || undefined };
    })
    .filter((r) => r.title);
}

function rowsFromCsv(text: string): RawTask[] {
  return text
    .split(/\r?\n/)
    .map((line) => {
      const cells = line.split(/[;,]/).map((c) => c.trim()).filter(Boolean);
      return { title: cells[0] ?? '', instructions: cells.slice(1).join(' — ') || undefined };
    })
    .filter((r) => r.title);
}

function dropHeader(rows: RawTask[]): RawTask[] {
  return rows.length > 0 && isHeaderRow(rows[0].title, rows[0].instructions)
    ? rows.slice(1)
    : rows;
}

export const importService = {
  async importFile(file: File, createdBy: string): Promise<Checklist> {
    const name = file.name.toLowerCase();
    const baseTitle = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');

    if (name.endsWith('.pdf')) {
      const lines = await parsePdf(file);
      const { title, taskLines } = splitHeading(lines, baseTitle);
      const tasks = toTasks(taskLines.map((l) => ({ title: l })));
      if (tasks.length === 0) {
        throw new Error('No text tasks could be extracted from this PDF.');
      }
      return buildChecklist(title, 'pdf', createdBy, tasks);
    }

    if (/\.xlsx$/.test(name)) {
      const tasks = toTasks(dropHeader(await rowsFromSheet(file)));
      if (tasks.length === 0) {
        throw new Error('No rows could be extracted from this spreadsheet.');
      }
      return buildChecklist(baseTitle, 'excel', createdBy, tasks);
    }

    if (/\.(xls|ods)$/.test(name)) {
      throw new Error('Please save this spreadsheet as .xlsx or .csv and import it again.');
    }

    if (/\.(csv|txt)$/.test(name)) {
      const tasks = toTasks(dropHeader(rowsFromCsv(await file.text())));
      if (tasks.length === 0) {
        throw new Error('No lines could be extracted from this file.');
      }
      return buildChecklist(baseTitle, 'csv', createdBy, tasks);
    }

    throw new Error('Unsupported file type. Use PDF, Excel (.xlsx), or CSV.');
  }
};
