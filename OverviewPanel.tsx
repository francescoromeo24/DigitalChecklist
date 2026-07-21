import { useEffect, useRef, useState } from 'react';
import type { AppNotification, AuditEntry, Checklist, NotificationPriority } from '../types';
import { checklistStatus, taskStatus } from '../types';

interface Props {
  checklists: Checklist[];
  notifications: AppNotification[];
  audit: AuditEntry[];
  onOpenChecklist: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onBackup: () => void;
  onRestore: (file: File) => void;
}

const PRIORITY_META: Record<NotificationPriority, { label: string; icon: string }> = {
  high: { label: 'High priority', icon: '⚠' },
  medium: { label: 'Medium priority', icon: '◆' },
  low: { label: 'Low priority', icon: '○' }
};

export default function OverviewPanel({
  checklists,
  notifications,
  audit,
  onOpenChecklist,
  onMarkRead,
  onMarkAllRead,
  onBackup,
  onRestore
}: Props) {
  const restoreInputRef = useRef<HTMLInputElement>(null);
  const [storage, setStorage] = useState<{ usedMb: string; persisted: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      if (!navigator.storage?.estimate) return;
      const est = await navigator.storage.estimate();
      const persisted = (await navigator.storage.persisted?.()) ?? false;
      setStorage({ usedMb: ((est.usage ?? 0) / 1024 / 1024).toFixed(1), persisted });
    })();
  }, [checklists, audit]);
  const allTasks = checklists.flatMap((c) =>
    c.tasks.map((t) => ({ task: t, checklist: c }))
  );

  // "Work orders" = tasks that have been assigned to a team member.
  const orders = allTasks.filter(({ task }) => task.assigneeId);
  const ordersDone = orders.filter(({ task }) => task.completed);

  const clStatuses = checklists.map(checklistStatus);
  const countCl = (s: string) => clStatuses.filter((x) => x === s).length;

  const tStatuses = allTasks.map(({ task, checklist }) => taskStatus(task, checklist));
  const countT = (s: string) => tStatuses.filter((x) => x === s).length;

  const unread = notifications.filter((n) => !n.read);
  const byPriority = (p: NotificationPriority) => unread.filter((n) => n.priority === p);

  return (
    <div className="checklist-panel overview-panel">
      <header className="panel-header">
        <div className="panel-title">
          <h1>Dashboard</h1>
          <span className="panel-subtitle">Live overview of your team's work</span>
        </div>
        <div className="panel-actions sync-actions">
          <button
            className="btn btn-secondary"
            onClick={onBackup}
            title="Download all data as a file — open it on another device to sync"
          >
            ⬇ Backup / Sync
          </button>
          <button
            className="btn btn-ghost"
            onClick={() => restoreInputRef.current?.click()}
            title="Load a backup file from another device"
          >
            ⬆ Restore
          </button>
          <input
            ref={restoreInputRef}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onRestore(file);
              e.target.value = '';
            }}
          />
        </div>
      </header>

      <div className="overview-scroll">
        <div className="stat-grid">
          <div className="stat-tile">
            <span className="stat-label">Work orders</span>
            <span className="stat-value">{orders.length}</span>
            <span className="stat-detail">
              {ordersDone.length} completed · {orders.length - ordersDone.length} open
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Notifications</span>
            <span className="stat-value">{unread.length}</span>
            <span className="stat-detail">unread · {notifications.length} total</span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Checklists</span>
            <span className="stat-value">{checklists.length}</span>
            <span className="stat-detail">
              {countCl('planned')} planned · {countCl('scheduled')} scheduled ·{' '}
              {countCl('ongoing')} ongoing · {countCl('completed')} completed
            </span>
          </div>
          <div className="stat-tile">
            <span className="stat-label">Tasks</span>
            <span className="stat-value">{allTasks.length}</span>
            <span className="stat-detail">
              {countT('planned')} planned · {countT('scheduled')} scheduled ·{' '}
              {countT('ongoing')} ongoing · {countT('completed')} completed
            </span>
          </div>
        </div>

        <section className="notif-board">
          <div className="notif-board-header">
            <h2>Notifications by priority</h2>
            {unread.length > 0 && (
              <button className="btn btn-ghost" onClick={onMarkAllRead}>
                Mark all as read
              </button>
            )}
          </div>
          {unread.length === 0 && (
            <p className="notif-empty">No unread notifications — you're all caught up.</p>
          )}
          <div className="notif-columns">
            {(['high', 'medium', 'low'] as NotificationPriority[]).map((priority) => {
              const items = byPriority(priority);
              return (
                <div key={priority} className={`notif-column priority-${priority}`}>
                  <div className="notif-column-header">
                    <span className="priority-badge">
                      {PRIORITY_META[priority].icon} {PRIORITY_META[priority].label}
                    </span>
                    <span className="notif-count">{items.length}</span>
                  </div>
                  {items.map((n) => (
                    <div key={n.id} className="notif-card">
                      <p>{n.message}</p>
                      <div className="notif-card-actions">
                        <span className="notif-time">
                          {new Date(n.createdAt).toLocaleString()}
                        </span>
                        {n.checklistId && (
                          <button
                            className="btn btn-ghost"
                            onClick={() => onOpenChecklist(n.checklistId!)}
                          >
                            Open
                          </button>
                        )}
                        <button className="btn btn-ghost" onClick={() => onMarkRead(n.id)}>
                          ✓ Read
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>

        <section className="activity-board">
          <div className="notif-board-header">
            <h2>Recent activity</h2>
            {storage && (
              <span className="storage-note">
                {storage.usedMb} MB stored{storage.persisted ? ' · protected' : ''} · back up regularly
              </span>
            )}
          </div>
          {audit.length === 0 ? (
            <p className="notif-empty">No activity recorded yet.</p>
          ) : (
            <ul className="activity-list">
              {audit.slice(0, 30).map((entry) => (
                <li key={entry.id} className="activity-item">
                  <span className="activity-time">
                    {new Date(entry.at).toLocaleString()}
                  </span>
                  <span className="activity-text">
                    <strong>{entry.userName}</strong> · {entry.action}
                    {entry.detail ? ` — ${entry.detail}` : ''}
                  </span>
                  {entry.checklistId && (
                    <button
                      className="btn btn-ghost"
                      onClick={() => onOpenChecklist(entry.checklistId!)}
                    >
                      Open
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
