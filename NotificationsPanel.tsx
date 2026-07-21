import { useState } from 'react';
import {
  nativePermission,
  nativeSupported,
  requestNativePermission
} from '../services/notifyService';
import type { AppNotification, NotificationType } from '../types';

interface Props {
  notifications: AppNotification[];
  onOpenChecklist: (id: string) => void;
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
}

type Filter = 'all' | 'assignment' | 'confirmation' | 'alert';

const FILTER_META: Record<Filter, { label: string; empty: string }> = {
  all: { label: 'All', empty: 'No notifications yet.' },
  assignment: {
    label: '📥 Received tasks',
    empty: 'No task assignments yet — when someone assigns you a task, it appears here.'
  },
  confirmation: {
    label: '✅ Confirmations',
    empty: 'No confirmations yet — when a task or checklist gets completed, it appears here.'
  },
  alert: {
    label: '⚠ Alerts',
    empty: 'No alerts — failed checks and flagged tasks will appear here.'
  }
};

const TYPE_ICONS: Record<NotificationType, string> = {
  assignment: '📥',
  confirmation: '✅',
  alert: '⚠',
  info: 'ℹ'
};

export default function NotificationsPanel({
  notifications,
  onOpenChecklist,
  onMarkRead,
  onMarkAllRead
}: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [permission, setPermission] = useState<NotificationPermission>(nativePermission());

  const enableAlerts = async () => {
    setPermission(await requestNativePermission());
  };

  const typeOf = (n: AppNotification): NotificationType => n.type ?? 'info';
  const visible = notifications.filter(
    (n) => filter === 'all' || typeOf(n) === filter
  );
  const unreadCount = notifications.filter((n) => !n.read).length;

  const countFor = (f: Filter) =>
    f === 'all'
      ? notifications.length
      : notifications.filter((n) => typeOf(n) === f).length;

  return (
    <div className="checklist-panel notifications-panel">
      <header className="panel-header">
        <div className="panel-title">
          <h1>🔔 Notifications</h1>
          <span className="panel-subtitle">
            {unreadCount > 0
              ? `${unreadCount} unread · ${notifications.length} total`
              : `All caught up · ${notifications.length} total`}
          </span>
        </div>
        <div className="panel-actions notif-header-actions">
          {nativeSupported() && permission !== 'granted' && (
            <button className="btn btn-ghost" onClick={enableAlerts} title="Get desktop/phone alerts">
              🔔 {permission === 'denied' ? 'Alerts blocked' : 'Enable alerts'}
            </button>
          )}
          {unreadCount > 0 && (
            <button className="btn btn-secondary" onClick={onMarkAllRead}>
              ✓ Mark all as read
            </button>
          )}
        </div>
      </header>

      <div className="filter-group" role="tablist" aria-label="Filter notifications">
        {(Object.keys(FILTER_META) as Filter[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            className={`filter-chip ${filter === f ? 'active' : ''}`}
            onClick={() => setFilter(f)}
          >
            {FILTER_META[f].label} ({countFor(f)})
          </button>
        ))}
      </div>

      <div className="notifications-scroll">
        {visible.length === 0 && (
          <p className="notif-empty">{FILTER_META[filter].empty}</p>
        )}
        {visible.map((n) => (
          <div
            key={n.id}
            className={`notif-card priority-${n.priority} ${n.read ? 'is-read' : 'is-unread'}`}
          >
            <span className="notif-type-icon" title={typeOf(n)}>
              {TYPE_ICONS[typeOf(n)]}
            </span>
            <div className="notif-body">
              <p>{n.message}</p>
              <span className="notif-time">{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            <div className="notif-card-actions">
              {n.checklistId && (
                <button className="btn btn-ghost" onClick={() => onOpenChecklist(n.checklistId!)}>
                  Open
                </button>
              )}
              {!n.read && (
                <button className="btn btn-ghost" onClick={() => onMarkRead(n.id)}>
                  ✓ Read
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
