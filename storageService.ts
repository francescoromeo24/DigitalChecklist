import type { AppDocument, AppNotification, AuditEntry, Checklist, Task, User } from '../types';
import { newId } from '../types';

const DB_NAME = 'digital-checklist-db';
const DB_VERSION = 4;
const CHECKLISTS = 'checklists';
const USERS = 'users';
const NOTIFICATIONS = 'notifications';
const DOCUMENTS = 'documents';
const AUDIT = 'audit';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CHECKLISTS)) {
        db.createObjectStore(CHECKLISTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(USERS)) {
        db.createObjectStore(USERS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(NOTIFICATIONS)) {
        db.createObjectStore(NOTIFICATIONS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(DOCUMENTS)) {
        db.createObjectStore(DOCUMENTS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(AUDIT)) {
        db.createObjectStore(AUDIT, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

function tx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const request = action(transaction.objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      })
  );
}

export const storageService = {
  async getChecklists(): Promise<Checklist[]> {
    const lists = await tx<Checklist[]>(CHECKLISTS, 'readonly', (s) => s.getAll());
    return lists.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async getChecklist(id: string): Promise<Checklist | undefined> {
    return tx<Checklist | undefined>(CHECKLISTS, 'readonly', (s) => s.get(id));
  },

  async saveChecklist(checklist: Checklist): Promise<Checklist> {
    const updated = { ...checklist, updatedAt: new Date().toISOString() };
    await tx(CHECKLISTS, 'readwrite', (s) => s.put(updated));
    return updated;
  },

  async deleteChecklist(id: string): Promise<void> {
    await tx(CHECKLISTS, 'readwrite', (s) => s.delete(id));
  },

  async updateTask(
    checklistId: string,
    taskId: string,
    changes: Partial<Task>
  ): Promise<Checklist | undefined> {
    const checklist = await this.getChecklist(checklistId);
    if (!checklist) return undefined;
    checklist.tasks = checklist.tasks.map((t) =>
      t.id === taskId ? { ...t, ...changes } : t
    );
    return this.saveChecklist(checklist);
  },

  async getUsers(): Promise<User[]> {
    return tx<User[]>(USERS, 'readonly', (s) => s.getAll());
  },

  async saveUser(user: User): Promise<User> {
    await tx(USERS, 'readwrite', (s) => s.put(user));
    return user;
  },

  async deleteUser(id: string): Promise<void> {
    await tx(USERS, 'readwrite', (s) => s.delete(id));
  },

  async getNotifications(): Promise<AppNotification[]> {
    const all = await tx<AppNotification[]>(NOTIFICATIONS, 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async addNotification(
    notification: Omit<AppNotification, 'id' | 'read' | 'createdAt'>
  ): Promise<AppNotification> {
    const full: AppNotification = {
      ...notification,
      id: newId(),
      read: false,
      createdAt: new Date().toISOString()
    };
    await tx(NOTIFICATIONS, 'readwrite', (s) => s.put(full));
    return full;
  },

  async markNotificationRead(id: string): Promise<void> {
    const all = await this.getNotifications();
    const target = all.find((n) => n.id === id);
    if (target) {
      await tx(NOTIFICATIONS, 'readwrite', (s) => s.put({ ...target, read: true }));
    }
  },

  async markAllNotificationsRead(audienceIds: string[]): Promise<void> {
    const all = await this.getNotifications();
    for (const n of all) {
      if (!n.read && audienceIds.includes(n.audience)) {
        await tx(NOTIFICATIONS, 'readwrite', (s) => s.put({ ...n, read: true }));
      }
    }
  },

  async getDocuments(): Promise<AppDocument[]> {
    const all = await tx<AppDocument[]>(DOCUMENTS, 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
  },

  async saveDocument(doc: AppDocument): Promise<AppDocument> {
    await tx(DOCUMENTS, 'readwrite', (s) => s.put(doc));
    return doc;
  },

  async deleteDocument(id: string): Promise<void> {
    await tx(DOCUMENTS, 'readwrite', (s) => s.delete(id));
  },

  async getAudit(limit = 200): Promise<AuditEntry[]> {
    const all = await tx<AuditEntry[]>(AUDIT, 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.at.localeCompare(a.at)).slice(0, limit);
  },

  async addAudit(entry: Omit<AuditEntry, 'id' | 'at'>): Promise<void> {
    const full: AuditEntry = { ...entry, id: newId(), at: new Date().toISOString() };
    await tx(AUDIT, 'readwrite', (s) => s.put(full));
  },

  /** Full data snapshot for backup / device-to-device sync. */
  async exportAll(): Promise<{
    app: string;
    version: number;
    exportedAt: string;
    checklists: Checklist[];
    users: User[];
    notifications: AppNotification[];
    documents: AppDocument[];
    audit: AuditEntry[];
  }> {
    const [checklists, users, notifications, documents, audit] = await Promise.all([
      this.getChecklists(),
      this.getUsers(),
      this.getNotifications(),
      this.getDocuments(),
      this.getAudit(10_000)
    ]);
    return {
      app: 'digital-checklist',
      version: DB_VERSION,
      exportedAt: new Date().toISOString(),
      checklists,
      users,
      notifications,
      documents,
      audit
    };
  },

  /** Replace all local data with a snapshot produced by exportAll. */
  async importAll(data: {
    app?: string;
    checklists?: Checklist[];
    users?: User[];
    notifications?: AppNotification[];
    documents?: AppDocument[];
    audit?: AuditEntry[];
  }): Promise<void> {
    if (data.app !== 'digital-checklist' || !Array.isArray(data.checklists)) {
      throw new Error('This file is not a Digital Checklist backup.');
    }
    await tx(CHECKLISTS, 'readwrite', (s) => s.clear());
    await tx(USERS, 'readwrite', (s) => s.clear());
    await tx(NOTIFICATIONS, 'readwrite', (s) => s.clear());
    await tx(DOCUMENTS, 'readwrite', (s) => s.clear());
    await tx(AUDIT, 'readwrite', (s) => s.clear());
    for (const d of data.documents ?? []) {
      await tx(DOCUMENTS, 'readwrite', (s) => s.put(d));
    }
    for (const a of data.audit ?? []) {
      await tx(AUDIT, 'readwrite', (s) => s.put(a));
    }
    for (const c of data.checklists ?? []) {
      await tx(CHECKLISTS, 'readwrite', (s) => s.put(c));
    }
    for (const u of data.users ?? []) {
      await tx(USERS, 'readwrite', (s) => s.put(u));
    }
    for (const n of data.notifications ?? []) {
      await tx(NOTIFICATIONS, 'readwrite', (s) => s.put(n));
    }
  },

  /** Wipe every store — used by the "start fresh" reset on the sign-in screen. */
  async clearAll(): Promise<void> {
    await tx(CHECKLISTS, 'readwrite', (s) => s.clear());
    await tx(USERS, 'readwrite', (s) => s.clear());
    await tx(NOTIFICATIONS, 'readwrite', (s) => s.clear());
    await tx(DOCUMENTS, 'readwrite', (s) => s.clear());
    await tx(AUDIT, 'readwrite', (s) => s.clear());
  }
};
