import { useCallback, useEffect, useRef, useState } from 'react';
import Sidebar from './Sidebar';
import ChecklistPanel from './ChecklistPanel';
import OverviewPanel from './OverviewPanel';
import MemberView from './MemberView';
import MembersManager from './MembersManager';
import ProfilePanel from './ProfilePanel';
import AIAssistant from './AIAssistant';
import NewChecklistModal from './NewChecklistModal';
import DocumentsPanel from './DocumentsPanel';
import NotificationsPanel from './NotificationsPanel';
import InstallButton from './InstallButton';
import { avatarColor, initials } from '../utils/avatar';
import { storageService } from '../services/storageService';
import { importService } from '../services/importService';
import { exportService } from '../services/exportService';
import { notifyNative } from '../services/notifyService';
import type { AppDocument, AppNotification, AuditEntry, Checklist, Task, User } from '../types';
import { newId, taskFailed } from '../types';

interface Props {
  user: User;
  onLogout: () => void;
  onUserChanged: (user: User) => void;
}

export default function Dashboard({ user, onLogout, onUserChanged }: Props) {
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [documents, setDocuments] = useState<AppDocument[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<'main' | 'documents' | 'notifications' | 'profile'>('main');
  const [showNewModal, setShowNewModal] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const isManager = user.role === 'admin' || user.role === 'supervisor';
  // Which notification audiences this user belongs to.
  const audienceIds = isManager ? ['managers', user.id] : [user.id];

  const refresh = useCallback(async () => {
    const [lists, allUsers, allNotifications, allDocuments, allAudit] = await Promise.all([
      storageService.getChecklists(),
      storageService.getUsers(),
      storageService.getNotifications(),
      storageService.getDocuments(),
      storageService.getAudit()
    ]);
    setChecklists(lists);
    setUsers(allUsers);
    setNotifications(allNotifications);
    setDocuments(allDocuments);
    setAudit(allAudit);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Ask the browser to keep this app's data from being evicted under storage pressure.
  useEffect(() => {
    navigator.storage?.persist?.().catch(() => undefined);
  }, []);

  // Close the account dropdown on an outside click.
  useEffect(() => {
    if (!accountMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(e.target as Node)) {
        setAccountMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [accountMenuOpen]);

  const logAudit = useCallback(
    (action: string, detail?: string, checklistId?: string) =>
      storageService.addAudit({ userId: user.id, userName: user.name, action, detail, checklistId }),
    [user]
  );

  const selected = checklists.find((c) => c.id === selectedId) ?? null;

  /** Compare old vs new checklist and emit notifications for meaningful events. */
  const emitChangeNotifications = useCallback(
    async (before: Checklist | undefined, after: Checklist) => {
      if (!before) return;
      const oldTasks = new Map(before.tasks.map((t) => [t.id, t]));

      for (const task of after.tasks) {
        const old = oldTasks.get(task.id);
        if (task.assigneeId && task.assigneeId !== old?.assigneeId && task.assigneeId !== user.id) {
          await storageService.addNotification({
            message: `You were assigned "${task.title}" in "${after.title}"`,
            priority: 'medium',
            type: 'assignment',
            audience: task.assigneeId,
            checklistId: after.id
          });
        }
        if (task.completed && old && !old.completed) {
          await logAudit('Completed task', `"${task.title}" in "${after.title}"`, after.id);
          if (!isManager) {
            await storageService.addNotification({
              message: `${user.name} completed "${task.title}" in "${after.title}"`,
              priority: 'medium',
              type: 'confirmation',
              audience: 'managers',
              checklistId: after.id
            });
          }
        }
        if (task.assigneeId && task.assigneeId !== old?.assigneeId) {
          const who = users.find((u) => u.id === task.assigneeId)?.name ?? 'someone';
          await logAudit('Assigned task', `"${task.title}" to ${who} in "${after.title}"`, after.id);
        }
        if (task.flagged && old && !old.flagged) {
          await storageService.addNotification({
            message: `Task "${task.title}" was flagged in "${after.title}"`,
            priority: 'high',
            type: 'alert',
            audience: 'managers',
            checklistId: after.id
          });
        }
      }

      if (before.signature === undefined && after.signature) {
        await logAudit(
          'Signed off checklist',
          `"${after.title}" signed by ${after.signature.name}`,
          after.id
        );
      }

      const wasComplete =
        before.tasks.length > 0 && before.tasks.every((t) => t.completed);
      const isComplete =
        after.tasks.length > 0 && after.tasks.every((t) => t.completed);
      if (isComplete && !wasComplete) {
        await storageService.addNotification({
          message: `Checklist "${after.title}" is fully completed`,
          priority: 'high',
          type: 'confirmation',
          audience: 'managers',
          checklistId: after.id
        });
      }
    },
    [user, isManager, users, logAudit]
  );

  /**
   * Automated escalation: a newly failed check (fail verdict or out-of-bounds
   * reading) raises a high-priority alert and a corrective work-order task.
   */
  const applyEscalations = useCallback(
    (incoming: Checklist): { checklist: Checklist; alerts: string[] } => {
      const alerts: string[] = [];
      const correctives: Task[] = [];
      const tasks = incoming.tasks.map((task) => {
        if (!taskFailed(task) || task.escalated || task.isCorrective) return task;
        const reason =
          task.kind === 'number'
            ? `reading ${task.value} outside allowed range`
            : 'failed the check';
        alerts.push(`ALERT: "${task.title}" in "${incoming.title}" ${reason}`);
        correctives.push({
          id: newId(),
          title: `Fix: ${task.title}`,
          completed: false,
          flagged: true,
          isCorrective: true,
          instructions: `Corrective work order raised automatically because "${task.title}" ${reason}.`
        });
        return { ...task, escalated: true };
      });
      return { checklist: { ...incoming, tasks: [...tasks, ...correctives] }, alerts };
    },
    []
  );

  const saveChecklist = useCallback(
    async (incoming: Checklist) => {
      const before = checklists.find((c) => c.id === incoming.id);
      const { checklist, alerts } = applyEscalations(incoming);
      // Optimistic update so toggles feel instant; refresh() then syncs from storage.
      setChecklists((prev) =>
        prev.map((c) => (c.id === checklist.id ? checklist : c))
      );
      await storageService.saveChecklist(checklist);
      for (const message of alerts) {
        await storageService.addNotification({
          message,
          priority: 'high',
          type: 'alert',
          audience: 'managers',
          checklistId: checklist.id
        });
        await logAudit('Failed check escalated', message, checklist.id);
      }
      await emitChangeNotifications(before, checklist);
      await refresh();
    },
    [checklists, applyEscalations, emitChangeNotifications, refresh, logAudit]
  );

  const announceNewChecklist = useCallback(
    async (checklist: Checklist, how: string) => {
      await storageService.addNotification({
        message: `Checklist "${checklist.title}" ${how}`,
        priority: 'low',
        type: 'info',
        audience: 'managers',
        checklistId: checklist.id
      });
    },
    []
  );

  const createChecklist = useCallback(
    async (checklist: Checklist) => {
      await storageService.saveChecklist(checklist);
      await announceNewChecklist(checklist, 'was created');
      await logAudit('Created checklist', `"${checklist.title}" (${checklist.tasks.length} tasks)`, checklist.id);
      await refresh();
      setView('main');
      setSelectedId(checklist.id);
      setShowNewModal(false);
    },
    [announceNewChecklist, refresh, logAudit]
  );

  const deleteChecklist = useCallback(
    async (id: string) => {
      const target = checklists.find((c) => c.id === id);
      await storageService.deleteChecklist(id);
      await logAudit('Deleted checklist', target ? `"${target.title}"` : id);
      setSelectedId((current) => (current === id ? null : current));
      await refresh();
    },
    [checklists, refresh, logAudit]
  );

  const importFile = useCallback(
    async (file: File) => {
      setImportError(null);
      setImporting(true);
      try {
        const checklist = await importService.importFile(file, user.id);
        await storageService.saveChecklist(checklist);
        await announceNewChecklist(checklist, `was imported from ${checklist.source.toUpperCase()}`);
        await logAudit(
          'Imported checklist',
          `"${checklist.title}" from ${checklist.source.toUpperCase()} (${checklist.tasks.length} tasks)`,
          checklist.id
        );
        await refresh();
        setView('main');
        setSelectedId(checklist.id);
      } catch (err) {
        setImportError(err instanceof Error ? err.message : 'Import failed');
      } finally {
        setImporting(false);
      }
    },
    [announceNewChecklist, refresh, user.id, logAudit]
  );

  const markNotificationRead = useCallback(
    async (id: string) => {
      await storageService.markNotificationRead(id);
      await refresh();
    },
    [refresh]
  );

  const markAllNotificationsRead = useCallback(async () => {
    const audiences = isManager ? ['managers', user.id] : [user.id];
    await storageService.markAllNotificationsRead(audiences);
    await refresh();
  }, [refresh, user.id, isManager]);

  // Move every open (and completed) task assignment from one member to another
  // (or to unassigned when toId is null) — used when removing a member.
  const reassignTasks = useCallback(
    async (fromId: string, toId: string | null) => {
      const lists = await storageService.getChecklists();
      for (const cl of lists) {
        let touched = false;
        const tasks = cl.tasks.map((t) => {
          if (t.assigneeId === fromId) {
            touched = true;
            return { ...t, assigneeId: toId ?? undefined };
          }
          return t;
        });
        if (touched) await storageService.saveChecklist({ ...cl, tasks });
      }
      await refresh();
    },
    [refresh]
  );

  // Let the signed-in user edit their own name/position; propagate to App so
  // the sidebar identity updates immediately.
  const updateOwnProfile = useCallback(
    async (changes: Partial<Pick<User, 'name' | 'position'>>) => {
      const updated = { ...user, ...changes };
      await storageService.saveUser(updated);
      onUserChanged(updated);
      await refresh();
    },
    [user, onUserChanged, refresh]
  );

  const backupData = useCallback(async () => {
    const snapshot = await storageService.exportAll();
    exportService.downloadBackup(JSON.stringify(snapshot, null, 2));
  }, []);

  const restoreData = useCallback(
    async (file: File) => {
      try {
        const data = JSON.parse(await file.text());
        if (
          !window.confirm(
            'Restoring a backup replaces ALL current data on this device. Continue?'
          )
        ) {
          return;
        }
        await storageService.importAll(data);
        setSelectedId(null);
        await refresh();
      } catch (err) {
        window.alert(
          err instanceof Error ? err.message : 'This file could not be read as a backup.'
        );
      }
    },
    [refresh]
  );

  const myNotifications = notifications.filter((n) =>
    audienceIds.includes(n.audience)
  );
  const unreadCount = myNotifications.filter((n) => !n.read).length;

  // Fire an OS notification when genuinely new unread items arrive for this user.
  const seenNotifIds = useRef<Set<string> | null>(null);
  useEffect(() => {
    const currentIds = new Set(myNotifications.map((n) => n.id));
    if (seenNotifIds.current === null) {
      seenNotifIds.current = currentIds; // first load: don't replay history
      return;
    }
    const fresh = myNotifications.filter((n) => !n.read && !seenNotifIds.current!.has(n.id));
    for (const n of fresh) {
      const title = n.type === 'alert' ? '⚠ Alert' : n.type === 'assignment' ? '📥 New task' : 'Digital Checklist';
      notifyNative(title, n.message);
    }
    seenNotifIds.current = currentIds;
  }, [myNotifications]);

  return (
    <div className="dashboard">
      <div className="topbar">
        <InstallButton />
        <button
          className={`topbar-bell ${view === 'notifications' ? 'active' : ''}`}
          onClick={() => setView('notifications')}
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ''}`}
          title="Notifications"
        >
          🔔
          {unreadCount > 0 && <span className="topbar-bell-badge">{unreadCount}</span>}
        </button>
        <div className="topbar-account" ref={accountMenuRef}>
          <button
            className={`topbar-avatar ${view === 'profile' || accountMenuOpen ? 'active' : ''}`}
            onClick={() => setAccountMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={accountMenuOpen}
            aria-label="Account menu"
            style={{ background: avatarColor(user.id) }}
          >
            {initials(user.name)}
          </button>
          {accountMenuOpen && (
            <div className="dropdown-menu account-menu" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  setView('profile');
                  setAccountMenuOpen(false);
                }}
              >
                Profile
              </button>
              {isManager && (
                <button
                  role="menuitem"
                  onClick={() => {
                    setShowMembers(true);
                    setAccountMenuOpen(false);
                  }}
                >
                  Team
                </button>
              )}
              <button role="menuitem" className="danger" onClick={onLogout}>
                Logout
              </button>
            </div>
          )}
        </div>
      </div>

      <Sidebar
        user={user}
        checklists={checklists}
        selectedId={
          view === 'documents'
            ? '__documents__'
            : view === 'notifications'
              ? '__notifications__'
              : view === 'profile'
                ? '__profile__'
                : selectedId
        }
        onSelect={(id) => {
          setView('main');
          setSelectedId(id);
        }}
        onShowOverview={() => {
          setView('main');
          setSelectedId(null);
        }}
        onShowDocuments={() => setView('documents')}
        documentCount={documents.length}
        onNewChecklist={() => setShowNewModal(true)}
        onImportFile={importFile}
        importing={importing}
        importError={importError}
        onDismissImportError={() => setImportError(null)}
        canManage={isManager}
      />

      <main className="main-panel">
        {view === 'documents' ? (
          <DocumentsPanel
            documents={documents}
            users={users}
            currentUser={user}
            canManage={isManager}
            onChanged={refresh}
          />
        ) : view === 'notifications' ? (
          <NotificationsPanel
            notifications={myNotifications}
            onOpenChecklist={(id) => {
              setView('main');
              setSelectedId(id);
            }}
            onMarkRead={markNotificationRead}
            onMarkAllRead={markAllNotificationsRead}
          />
        ) : view === 'profile' ? (
          <ProfilePanel
            user={user}
            checklists={checklists}
            audit={audit}
            onSelfUpdate={updateOwnProfile}
            onChanged={refresh}
            onOpenChecklist={(id) => {
              setView('main');
              setSelectedId(id);
            }}
          />
        ) : isManager ? (
          selected ? (
            <ChecklistPanel
              checklist={selected}
              users={users}
              currentUser={user}
              onChange={saveChecklist}
              onDelete={() => deleteChecklist(selected.id)}
            />
          ) : (
            <OverviewPanel
              checklists={checklists}
              notifications={myNotifications}
              audit={audit}
              onOpenChecklist={setSelectedId}
              onMarkRead={markNotificationRead}
              onMarkAllRead={markAllNotificationsRead}
              onBackup={backupData}
              onRestore={restoreData}
            />
          )
        ) : (
          <MemberView
            user={user}
            checklists={checklists}
            selectedId={selectedId}
            notifications={myNotifications}
            onMarkRead={markNotificationRead}
            onChange={saveChecklist}
          />
        )}
      </main>

      {showNewModal && (
        <NewChecklistModal
          user={user}
          onCreate={createChecklist}
          onClose={() => setShowNewModal(false)}
        />
      )}

      {showMembers && (
        <MembersManager
          users={users}
          currentUser={user}
          checklists={checklists}
          onChanged={refresh}
          onReassignTasks={reassignTasks}
          onClose={() => setShowMembers(false)}
        />
      )}

      <AIAssistant
        user={user}
        members={users.filter((u) => u.role === 'member')}
        onChecklistCreated={async (id) => {
          const created = await storageService.getChecklist(id);
          if (created) {
            const byAssignee = new Map<string, number>();
            for (const t of created.tasks) {
              if (t.assigneeId && t.assigneeId !== user.id) {
                byAssignee.set(t.assigneeId, (byAssignee.get(t.assigneeId) ?? 0) + 1);
              }
            }
            for (const [assigneeId, count] of byAssignee) {
              await storageService.addNotification({
                message: `You were assigned ${count} task${count > 1 ? 's' : ''} in "${created.title}"`,
                priority: 'medium',
                type: 'assignment',
                audience: assigneeId,
                checklistId: id
              });
            }
            await announceNewChecklist(created, 'was generated by the AI assistant');
          }
          await refresh();
          setView('main');
          setSelectedId(id);
        }}
      />
    </div>
  );
}
