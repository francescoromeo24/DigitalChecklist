import { ChangeEvent, FormEvent, useMemo, useRef, useState } from 'react';
import { storageService } from '../services/storageService';
import { authService } from '../services/authService';
import { avatarColor, initials } from '../utils/avatar';
import type { Checklist, Role, User } from '../types';

interface Props {
  users: User[];
  currentUser: User;
  checklists: Checklist[];
  onChanged: () => Promise<void> | void;
  onReassignTasks: (fromId: string, toId: string | null) => Promise<void>;
  onClose: () => void;
}

type SortKey = 'name' | 'role' | 'position';

interface EditState {
  name: string;
  email: string;
  position: string;
  role: Role;
}

interface ImportResult {
  email: string;
  password: string;
  status: 'added' | 'skipped';
}

export default function MembersManager({
  users,
  currentUser,
  checklists,
  onChanged,
  onReassignTasks,
  onClose
}: Props) {
  const canManage = currentUser.role === 'admin';

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('name');

  // Add-member form
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [position, setPosition] = useState('');
  const [role, setRole] = useState<Role>('member');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-row transient state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [edit, setEdit] = useState<EditState | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [removing, setRemoving] = useState<User | null>(null);
  const [reassignTo, setReassignTo] = useState<string>('');

  const [importResult, setImportResult] = useState<ImportResult[] | null>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  const knownPositions = useMemo(
    () => Array.from(new Set(users.map((u) => u.position).filter(Boolean))) as string[],
    [users]
  );

  const activeMembers = users.filter((u) => u.role === 'member' && u.active !== false);

  const workload = (userId: string) => {
    let open = 0;
    let done = 0;
    for (const c of checklists) {
      for (const t of c.tasks) {
        if (t.assigneeId === userId) t.completed ? done++ : open++;
      }
    }
    return { open, done };
  };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = users.filter(
      (u) =>
        !q ||
        u.name.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.position ?? '').toLowerCase().includes(q)
    );
    const roleRank: Record<Role, number> = { admin: 0, supervisor: 1, member: 2 };
    return [...filtered].sort((a, b) => {
      if (sort === 'role') return roleRank[a.role] - roleRank[b.role] || a.name.localeCompare(b.name);
      if (sort === 'position') return (a.position ?? '').localeCompare(b.position ?? '') || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
  }, [users, search, sort]);

  const audit = (action: string, detail: string) =>
    storageService.addAudit({ userId: currentUser.id, userName: currentUser.name, action, detail });

  const addMember = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (users.some((u) => u.email.toLowerCase() === email.trim().toLowerCase())) {
      return setError('A user with this email already exists.');
    }
    if (password.length < 6) {
      return setError('Set an initial password of at least 6 characters (or use Generate).');
    }
    const user = await authService.buildUser(name, email, role, password);
    user.position = position.trim() || undefined;
    user.active = true;
    await storageService.saveUser(user);
    await audit('Added member', `${user.name}${user.position ? `, ${user.position}` : ''} (${user.role})`);
    setName('');
    setEmail('');
    setPosition('');
    setRole('member');
    setPassword('');
    await onChanged();
  };

  const startEdit = (user: User) => {
    setEditingId(user.id);
    setEdit({ name: user.name, email: user.email, position: user.position ?? '', role: user.role });
  };

  const saveEdit = async (user: User) => {
    if (!edit) return;
    if (
      users.some(
        (u) => u.id !== user.id && u.email.toLowerCase() === edit.email.trim().toLowerCase()
      )
    ) {
      window.alert('Another user already uses that email.');
      return;
    }
    const updated: User = {
      ...user,
      name: edit.name.trim() || user.name,
      email: edit.email.trim() || user.email,
      position: edit.position.trim() || undefined,
      role: edit.role
    };
    await storageService.saveUser(updated);
    await audit('Edited member', updated.name);
    setEditingId(null);
    setEdit(null);
    await onChanged();
  };

  const doReset = async (user: User) => {
    if (resetPw.length < 6) {
      window.alert('Password must be at least 6 characters.');
      return;
    }
    const updated = await authService.setPassword(user, resetPw);
    await storageService.saveUser(updated);
    await audit('Reset password', `for ${user.name}`);
    setResettingId(null);
    setResetPw('');
    await onChanged();
  };

  const toggleActive = async (user: User) => {
    const updated: User = { ...user, active: user.active === false };
    await storageService.saveUser(updated);
    await audit(updated.active ? 'Reactivated member' : 'Deactivated member', user.name);
    await onChanged();
  };

  const confirmRemove = async () => {
    if (!removing) return;
    if (reassignTo) {
      await onReassignTasks(removing.id, reassignTo);
    }
    await storageService.deleteUser(removing.id);
    await audit('Removed member', removing.name);
    setRemoving(null);
    setReassignTo('');
    await onChanged();
  };

  const importCsv = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const text = await file.text();
    const rows = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const results: ImportResult[] = [];
    const existing = new Set(users.map((u) => u.email.toLowerCase()));
    for (const row of rows) {
      const cols = row.split(/[;,]/).map((c) => c.trim());
      const [rName, rEmail, rPosition, rRoleRaw, rPassword] = cols;
      if (!rEmail || !/@/.test(rEmail)) continue; // skip headers / invalid
      if (/^(email|e-mail)$/i.test(rEmail)) continue;
      if (existing.has(rEmail.toLowerCase())) {
        results.push({ email: rEmail, password: '', status: 'skipped' });
        continue;
      }
      const rRole: Role = ['member', 'supervisor', 'admin'].includes((rRoleRaw ?? '').toLowerCase())
        ? ((rRoleRaw as string).toLowerCase() as Role)
        : 'member';
      const pw = rPassword && rPassword.length >= 6 ? rPassword : authService.generatePassword();
      const user = await authService.buildUser(rName || rEmail.split('@')[0], rEmail, rRole, pw);
      user.position = rPosition || undefined;
      user.active = true;
      await storageService.saveUser(user);
      existing.add(rEmail.toLowerCase());
      results.push({ email: rEmail, password: pw, status: 'added' });
    }
    const added = results.filter((r) => r.status === 'added').length;
    if (added > 0) await audit('Imported members', `${added} added from CSV`);
    setImportResult(results);
    await onChanged();
  };

  const copy = (text: string) => navigator.clipboard?.writeText(text).catch(() => undefined);

  if (importResult) {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <div className="modal" onClick={(e) => e.stopPropagation()}>
          <header className="modal-header">
            <h2>Import results</h2>
            <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
          </header>
          <div className="modal-body">
            <p className="member-form-hint">
              {importResult.filter((r) => r.status === 'added').length} added,{' '}
              {importResult.filter((r) => r.status === 'skipped').length} skipped (already existed).
              Share each password with its member.
            </p>
            <ul className="member-list">
              {importResult.map((r) => (
                <li key={r.email}>
                  <div>
                    <strong>{r.email}</strong>
                    {r.status === 'added'
                      ? <span className="member-email">password: <code>{r.password}</code></span>
                      : <span className="member-email">skipped — already exists</span>}
                  </div>
                  {r.status === 'added' && (
                    <button className="btn btn-ghost" onClick={() => copy(`${r.email} ${r.password}`)} title="Copy">
                      📋
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <button className="btn btn-primary" onClick={() => setImportResult(null)}>
              Back to team
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Team {canManage ? '' : '(view only)'}</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">✕</button>
        </header>
        <div className="modal-body">
          <div className="team-toolbar">
            <input
              type="search"
              className="team-search"
              placeholder="Search name, email or position…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search team"
            />
            <label className="field-inline">
              <span>Sort</span>
              <select value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
                <option value="name">Name</option>
                <option value="role">Role</option>
                <option value="position">Position</option>
              </select>
            </label>
          </div>

          <ul className="member-list">
            {visible.map((user) => {
              const { open, done } = workload(user.id);
              const inactive = user.active === false;
              if (editingId === user.id && edit) {
                return (
                  <li key={user.id} className="member-editing">
                    <div className="member-edit-grid">
                      <input aria-label="Name" value={edit.name}
                        onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="Name" />
                      <input aria-label="Email" type="email" value={edit.email}
                        onChange={(e) => setEdit({ ...edit, email: e.target.value })} placeholder="Email" />
                      <input aria-label="Position" value={edit.position}
                        onChange={(e) => setEdit({ ...edit, position: e.target.value })} placeholder="Position" list="positions" />
                      <select aria-label="Role" value={edit.role}
                        onChange={(e) => setEdit({ ...edit, role: e.target.value as Role })}>
                        <option value="member">Member</option>
                        <option value="supervisor">Supervisor</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>
                    <div className="member-actions">
                      <button className="btn btn-primary" onClick={() => saveEdit(user)}>Save</button>
                      <button className="btn btn-ghost" onClick={() => { setEditingId(null); setEdit(null); }}>Cancel</button>
                    </div>
                  </li>
                );
              }
              return (
                <li key={user.id} className={inactive ? 'member-inactive' : ''}>
                  <span className="avatar" style={{ background: avatarColor(user.id) }}>
                    {initials(user.name)}
                  </span>
                  <div className="member-info">
                    <strong>
                      {user.name}
                      {inactive && <span className="inactive-tag">inactive</span>}
                    </strong>
                    {user.position && <span className="member-position">{user.position}</span>}
                    <span className="member-email">{user.email}</span>
                    <span className="member-workload">{open} open · {done} done</span>
                  </div>
                  <span className={`role-badge role-${user.role}`}>{user.role}</span>
                  {canManage && (
                    <div className="member-actions">
                      <button className="btn btn-ghost" title="Edit" onClick={() => startEdit(user)}>✏️</button>
                      <button className="btn btn-ghost" title="Reset password"
                        onClick={() => { setResettingId(user.id); setResetPw(authService.generatePassword()); }}>🔑</button>
                      {user.id !== currentUser.id && (
                        <>
                          <button className="btn btn-ghost" title={inactive ? 'Reactivate' : 'Deactivate'}
                            onClick={() => toggleActive(user)}>{inactive ? '↺' : '⏸'}</button>
                          <button className="btn btn-ghost danger" title="Remove"
                            onClick={() => { setRemoving(user); setReassignTo(''); }}>✕</button>
                        </>
                      )}
                    </div>
                  )}
                  {resettingId === user.id && canManage && (
                    <div className="reset-row">
                      <input aria-label="New password" type="text" value={resetPw}
                        onChange={(e) => setResetPw(e.target.value)} />
                      <button className="btn btn-ghost" title="Copy" onClick={() => copy(resetPw)}>📋</button>
                      <button className="btn btn-primary" onClick={() => doReset(user)}>Set</button>
                      <button className="btn btn-ghost" onClick={() => setResettingId(null)}>Cancel</button>
                    </div>
                  )}
                </li>
              );
            })}
            {visible.length === 0 && <p className="notif-empty">No members match your search.</p>}
          </ul>

          <datalist id="positions">
            {knownPositions.map((p) => <option key={p} value={p} />)}
          </datalist>

          {canManage && (
            <form onSubmit={addMember} className="member-form">
              <div className="member-form-head">
                <h3>Add member</h3>
                <button type="button" className="btn btn-ghost" onClick={() => csvInputRef.current?.click()}>
                  ⇪ Import CSV
                </button>
                <input ref={csvInputRef} type="file" accept=".csv,.txt" hidden onChange={importCsv} />
              </div>
              <label className="field">
                <span>Full name</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="field">
                <span>Email</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email@company.com" required />
              </label>
              <label className="field">
                <span>Job position</span>
                <input type="text" value={position} list="positions"
                  onChange={(e) => setPosition(e.target.value)} placeholder="e.g. Line Operator" />
              </label>
              <label className="field">
                <span>Access role</span>
                <select value={role} onChange={(e) => setRole(e.target.value as Role)}>
                  <option value="member">Member</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="field">
                <span>Initial password</span>
                <div className="pw-row">
                  <input type={showPw ? 'text' : 'password'} value={password}
                    onChange={(e) => setPassword(e.target.value)} required />
                  <button type="button" className="btn btn-ghost" title="Generate"
                    onClick={() => { setPassword(authService.generatePassword()); setShowPw(true); }}>🎲</button>
                  <button type="button" className="btn btn-ghost" title={showPw ? 'Hide' : 'Show'}
                    onClick={() => setShowPw((s) => !s)}>{showPw ? '🙈' : '👁'}</button>
                  <button type="button" className="btn btn-ghost" title="Copy"
                    onClick={() => copy(password)}>📋</button>
                </div>
              </label>
              <p className="member-form-hint">
                Share this password with the member so they can sign in; they can change it themselves
                from “My account”, and you can reset it any time.
              </p>
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="btn btn-primary">Add member</button>
            </form>
          )}
        </div>
      </div>

      {removing && (
        <div className="modal-backdrop" onClick={() => setRemoving(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h2>Remove {removing.name}?</h2>
              <button className="btn btn-ghost" onClick={() => setRemoving(null)} aria-label="Close">✕</button>
            </header>
            <div className="modal-body">
              {(() => {
                const { open } = workload(removing.id);
                return open > 0 ? (
                  <>
                    <p className="member-form-hint">
                      {removing.name} has {open} open task{open > 1 ? 's' : ''}. Reassign them to:
                    </p>
                    <select value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
                      <option value="">Leave unassigned</option>
                      {activeMembers
                        .filter((m) => m.id !== removing.id)
                        .map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}{m.position ? ` — ${m.position}` : ''}
                          </option>
                        ))}
                    </select>
                  </>
                ) : (
                  <p className="member-form-hint">This member has no open tasks.</p>
                );
              })()}
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setRemoving(null)}>Cancel</button>
                <button className="btn btn-primary danger" onClick={confirmRemove}>Remove</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
