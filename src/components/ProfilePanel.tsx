import { FormEvent, useState } from 'react';
import { authService } from '../services/authService';
import { storageService } from '../services/storageService';
import {
  nativePermission,
  nativeSupported,
  requestNativePermission
} from '../services/notifyService';
import { avatarColor, initials } from '../utils/avatar';
import ProgressBar from './ProgressBar';
import type { AuditEntry, Checklist, User } from '../types';

interface Props {
  user: User;
  checklists: Checklist[];
  audit: AuditEntry[];
  onSelfUpdate: (changes: Partial<Pick<User, 'name' | 'position'>>) => Promise<void>;
  onChanged: () => Promise<void> | void;
  onOpenChecklist: (id: string) => void;
}

export default function ProfilePanel({
  user,
  checklists,
  audit,
  onSelfUpdate,
  onChanged,
  onOpenChecklist
}: Props) {
  const isManager = user.role === 'admin' || user.role === 'supervisor';

  // Identity self-edit
  const [name, setName] = useState(user.name);
  const [position, setPosition] = useState(user.position ?? '');
  const [idSaved, setIdSaved] = useState(false);
  const [idError, setIdError] = useState<string | null>(null);

  // Password change
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [pwError, setPwError] = useState<string | null>(null);
  const [pwDone, setPwDone] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);

  const [permission, setPermission] = useState<NotificationPermission>(nativePermission());
  const [recovery, setRecovery] = useState<string | null>(null);

  const saveIdentity = async (e: FormEvent) => {
    e.preventDefault();
    setIdError(null);
    setIdSaved(false);
    if (!name.trim()) return setIdError('Name cannot be empty.');
    await onSelfUpdate({ name: name.trim(), position: position.trim() || undefined });
    setIdSaved(true);
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    setPwError(null);
    setPwDone(false);
    if (next.length < 6) return setPwError('Choose a new password of at least 6 characters.');
    if (next !== confirm) return setPwError('The new passwords do not match.');
    setPwBusy(true);
    try {
      const updated = await authService.changePassword(user, current, next);
      await storageService.saveUser(updated);
      await onChanged();
      setCurrent('');
      setNext('');
      setConfirm('');
      setPwDone(true);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Could not change password.');
    } finally {
      setPwBusy(false);
    }
  };

  const enableAlerts = async () => setPermission(await requestNativePermission());

  const regenerateRecovery = async () => {
    if (!window.confirm('Generate a new recovery code? The old one stops working immediately.')) return;
    const { user: updated, code } = await authService.regenerateRecovery(user);
    await storageService.saveUser(updated);
    await storageService.addAudit({
      userId: user.id,
      userName: user.name,
      action: 'Regenerated recovery code',
      detail: ''
    });
    await onChanged();
    setRecovery(code);
  };

  // Member work summary
  const myTasks = checklists.flatMap((c) =>
    c.tasks.filter((t) => t.assigneeId === user.id).map((t) => ({ task: t, checklist: c }))
  );
  const done = myTasks.filter(({ task }) => task.completed);
  const pct = myTasks.length === 0 ? 0 : Math.round((done.length / myTasks.length) * 100);
  const myChecklists = Array.from(new Set(myTasks.map(({ checklist }) => checklist.id))).map(
    (id) => checklists.find((c) => c.id === id)!
  );
  const recentDone = [...done]
    .filter(({ task }) => task.completedAt)
    .sort((a, b) => (b.task.completedAt ?? '').localeCompare(a.task.completedAt ?? ''))
    .slice(0, 5);

  const myActivity = audit.filter((a) => a.userId === user.id).slice(0, 12);

  return (
    <div className="checklist-panel profile-panel">
      <header className="panel-header">
        <div className="panel-title">
          <h1>👤 My profile</h1>
          <span className="panel-subtitle">Your details, security and activity</span>
        </div>
      </header>

      <div className="profile-scroll">
        <div className="profile-card">
          <span className="avatar avatar-lg" style={{ background: avatarColor(user.id) }}>
            {initials(user.name)}
          </span>
          <div className="profile-id">
            <strong>{user.name}</strong>
            {user.position && <span className="member-position">{user.position}</span>}
            <span className="member-email">{user.email}</span>
            <span className={`role-badge role-${user.role}`}>{user.role}</span>
          </div>
        </div>

        {/* Member "My work" summary */}
        {!isManager && (
          <section className="profile-section">
            <h2>My work</h2>
            <div className="stat-grid">
              <div className="stat-tile">
                <span className="stat-label">Assigned tasks</span>
                <span className="stat-value">{myTasks.length}</span>
                <span className="stat-detail">{done.length} completed · {myTasks.length - done.length} open</span>
              </div>
              <div className="stat-tile">
                <span className="stat-label">Completion</span>
                <span className="stat-value">{pct}%</span>
                <span className="stat-detail">across {myChecklists.length} checklist(s)</span>
              </div>
            </div>
            <ProgressBar value={pct} />
            {recentDone.length > 0 && (
              <>
                <h3 className="profile-subhead">Recently completed</h3>
                <ul className="activity-list">
                  {recentDone.map(({ task, checklist }) => (
                    <li key={task.id} className="activity-item">
                      <span className="activity-time">
                        {task.completedAt ? new Date(task.completedAt).toLocaleString() : ''}
                      </span>
                      <span className="activity-text">
                        {task.title} — <em>{checklist.title}</em>
                      </span>
                      <button className="btn btn-ghost" onClick={() => onOpenChecklist(checklist.id)}>
                        Open
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {/* Editable identity */}
        <section className="profile-section">
          <h2>Details</h2>
          <form onSubmit={saveIdentity} className="profile-form">
            <label className="field">
              <span>Full name</span>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="field">
              <span>Job position</span>
              <input type="text" value={position} onChange={(e) => setPosition(e.target.value)}
                placeholder="e.g. Line Operator" />
            </label>
            {idError && <p className="form-error">{idError}</p>}
            {idSaved && <p className="form-success">Details saved.</p>}
            <button type="submit" className="btn btn-primary">Save details</button>
          </form>
        </section>

        {/* Password */}
        <section className="profile-section">
          <h2>Password</h2>
          <form onSubmit={changePassword} className="profile-form">
            <label className="field">
              <span>Current password</span>
              <input type={showPw ? 'text' : 'password'} value={current}
                onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" required />
            </label>
            <label className="field">
              <span>New password</span>
              <input type={showPw ? 'text' : 'password'} value={next}
                onChange={(e) => setNext(e.target.value)} autoComplete="new-password" required />
            </label>
            <label className="field">
              <span>Confirm new password</span>
              <input type={showPw ? 'text' : 'password'} value={confirm}
                onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={showPw} onChange={(e) => setShowPw(e.target.checked)} />
              Show passwords
            </label>
            {pwError && <p className="form-error">{pwError}</p>}
            {pwDone && <p className="form-success">Password updated.</p>}
            <button type="submit" className="btn btn-primary" disabled={pwBusy}>
              {pwBusy ? 'Saving…' : 'Update password'}
            </button>
          </form>
        </section>

        {/* Alerts */}
        {nativeSupported() && (
          <section className="profile-section">
            <h2>Alerts</h2>
            <p className="member-form-hint">
              Get a desktop/phone notification when a new task or alert arrives while the app is open.
            </p>
            {permission === 'granted' ? (
              <p className="form-success">Alerts are enabled.</p>
            ) : permission === 'denied' ? (
              <p className="member-form-hint">Alerts are blocked in your browser settings.</p>
            ) : (
              <button className="btn btn-secondary" onClick={enableAlerts}>🔔 Enable alerts</button>
            )}
          </section>
        )}

        {/* Manager activity */}
        {isManager && (
          <section className="profile-section">
            <h2>My recent activity</h2>
            {myActivity.length === 0 ? (
              <p className="notif-empty">No activity recorded yet.</p>
            ) : (
              <ul className="activity-list">
                {myActivity.map((a) => (
                  <li key={a.id} className="activity-item">
                    <span className="activity-time">{new Date(a.at).toLocaleString()}</span>
                    <span className="activity-text">{a.action}{a.detail ? ` — ${a.detail}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Admin recovery code */}
        {user.role === 'admin' && (
          <section className="profile-section">
            <h2>Recovery code</h2>
            <p className="member-form-hint">
              Used to reset your password if you forget it. Generate a new one if it may have been lost.
            </p>
            {recovery && <div className="recovery-code">{recovery}</div>}
            <button className="btn btn-secondary" onClick={regenerateRecovery}>
              Generate new recovery code
            </button>
          </section>
        )}
      </div>
    </div>
  );
}
