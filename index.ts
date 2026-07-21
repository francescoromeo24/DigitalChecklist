export type Role = 'admin' | 'supervisor' | 'member';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Job position / title, e.g. "Line Operator" (distinct from the access role). */
  position?: string;
  /** Deactivated accounts (active === false) are kept for history but cannot sign in. */
  active?: boolean;
  /** PBKDF2 hash + salt (hex). Optional so legacy/imported records don't break. */
  passwordHash?: string;
  passwordSalt?: string;
  /** Hash + salt of a one-time recovery code, used to reset a forgotten password. */
  recoveryHash?: string;
  recoverySalt?: string;
}

/** How a task is checked off: simple checkbox, pass/fail verdict, or a numeric reading. */
export type TaskKind = 'check' | 'passfail' | 'number';

export interface Task {
  id: string;
  title: string;
  description?: string;
  completed: boolean;
  flagged: boolean;
  assigneeId?: string;
  completedBy?: string;
  completedAt?: string;
  kind?: TaskKind;
  /** Step-by-step guidance shown to the operator. */
  instructions?: string;
  /** Reference link (manual, diagram, video). */
  link?: string;
  /** Photos as data URLs: visual guides or defect evidence. */
  photos?: string[];
  /** Free-text note / evidence comment. */
  note?: string;
  /** Pass/fail verdict for kind 'passfail'. */
  result?: 'pass' | 'fail';
  /** Recorded reading for kind 'number', with optional allowed bounds. */
  value?: number;
  min?: number;
  max?: number;
  /** Set once an alert + corrective task were raised, to avoid duplicates. */
  escalated?: boolean;
  /** Marks auto-created corrective tasks. */
  isCorrective?: boolean;
}

/** A failed check: explicit fail verdict or a reading outside its bounds. */
export function taskFailed(task: Task): boolean {
  if (task.result === 'fail') return true;
  if (task.kind === 'number' && task.value !== undefined) {
    if (task.min !== undefined && task.value < task.min) return true;
    if (task.max !== undefined && task.value > task.max) return true;
  }
  return false;
}

export type ChecklistSource = 'manual' | 'pdf' | 'excel' | 'csv' | 'ai';

export interface Checklist {
  id: string;
  title: string;
  description?: string;
  source: ChecklistSource;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  tasks: Task[];
  /** Digital sign-off recorded when a manager signs the completed checklist. */
  signature?: {
    name: string;
    image?: string;
    signedAt: string;
    userId: string;
  };
}

export type NotificationPriority = 'high' | 'medium' | 'low';

/**
 * What the notification is about:
 * assignment = a task was given to you; confirmation = someone completed
 * a task/checklist; alert = a failed check or flag; info = everything else.
 */
export type NotificationType = 'assignment' | 'confirmation' | 'alert' | 'info';

export interface AppNotification {
  id: string;
  message: string;
  priority: NotificationPriority;
  type?: NotificationType;
  /** 'managers' targets admins/supervisors; otherwise a specific user id. */
  audience: 'managers' | string;
  read: boolean;
  createdAt: string;
  checklistId?: string;
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  checklistId?: string;
  timestamp: string;
  /** Quick-reply choices rendered as buttons under an assistant message. */
  options?: { label: string; value: string }[];
}

/** A document in the shared library: an uploaded file and/or an external link. */
export interface AppDocument {
  id: string;
  title: string;
  description?: string;
  fileName?: string;
  mime?: string;
  size?: number;
  /** File content as a data URL (kept small — uploads are capped). */
  dataUrl?: string;
  link?: string;
  uploadedBy: string;
  uploadedAt: string;
}

/** An immutable record of a meaningful action, for accountability/compliance. */
export interface AuditEntry {
  id: string;
  at: string;
  userId: string;
  userName: string;
  action: string;
  detail?: string;
  checklistId?: string;
}

export type ChecklistStatus = 'planned' | 'scheduled' | 'ongoing' | 'completed';

/**
 * Lifecycle of a checklist derived from its data:
 * completed = every task done; ongoing = work has started;
 * scheduled = untouched but has a due date; planned = untouched, no date yet.
 */
export function checklistStatus(checklist: Checklist): ChecklistStatus {
  const total = checklist.tasks.length;
  const done = checklist.tasks.filter((t) => t.completed).length;
  if (total > 0 && done === total) return 'completed';
  if (done > 0) return 'ongoing';
  if (checklist.dueDate) return 'scheduled';
  return 'planned';
}

/**
 * Same idea for a single task: completed; ongoing = assigned to someone;
 * scheduled = its checklist has a due date; planned otherwise.
 */
export function taskStatus(task: Task, checklist: Checklist): ChecklistStatus {
  if (task.completed) return 'completed';
  if (task.assigneeId) return 'ongoing';
  if (checklist.dueDate) return 'scheduled';
  return 'planned';
}

export function checklistProgress(checklist: Checklist): number {
  if (checklist.tasks.length === 0) return 0;
  const done = checklist.tasks.filter((t) => t.completed).length;
  return Math.round((done / checklist.tasks.length) * 100);
}

export function newId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}
