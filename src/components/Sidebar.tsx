import { ChangeEvent, useRef } from 'react';
import ProgressBar from './ProgressBar';
import type { Checklist, User } from '../types';
import { checklistProgress } from '../types';

interface Props {
  user: User;
  checklists: Checklist[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onShowOverview: () => void;
  onShowDocuments: () => void;
  documentCount: number;
  onNewChecklist: () => void;
  onImportFile: (file: File) => void;
  importing: boolean;
  importError: string | null;
  onDismissImportError: () => void;
  canManage: boolean;
}

export default function Sidebar({
  user,
  checklists,
  selectedId,
  onSelect,
  onShowOverview,
  onShowDocuments,
  documentCount,
  onNewChecklist,
  onImportFile,
  importing,
  importError,
  onDismissImportError,
  canManage
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onImportFile(file);
    e.target.value = '';
  };

  const visible = canManage
    ? checklists
    : checklists.filter((c) => c.tasks.some((t) => t.assigneeId === user.id));

  return (
    <aside className="sidebar">
      <header className="sidebar-header">
        <div className="sidebar-brand">
          <img src="/icon.svg" alt="" width={28} height={28} />
          <div>
            <strong>Digital Checklist</strong>
            <span className="sidebar-user">
              {user.name} · <span className={`role-badge role-${user.role}`}>{user.role}</span>
            </span>
          </div>
        </div>
      </header>

      <nav className="checklist-list" aria-label="Checklists">
        <button
          className={`checklist-item overview-link ${selectedId === null ? 'selected' : ''}`}
          onClick={onShowOverview}
        >
          <div className="checklist-item-top">
            <span className="checklist-item-title">
              {canManage ? '📊 Dashboard' : '📋 My tasks'}
            </span>
          </div>
        </button>
        <button
          className={`checklist-item overview-link ${selectedId === '__documents__' ? 'selected' : ''}`}
          onClick={onShowDocuments}
        >
          <div className="checklist-item-top">
            <span className="checklist-item-title">📁 Documentation</span>
            {documentCount > 0 && <span className="doc-count">{documentCount}</span>}
          </div>
        </button>
        <span className="sidebar-section-label">Checklists</span>
        {visible.length === 0 && (
          <p className="checklist-list-empty">
            {canManage
              ? 'No checklists yet. Create or import one below.'
              : 'No checklists with tasks assigned to you yet.'}
          </p>
        )}
        {visible.map((checklist) => {
          const progress = checklistProgress(checklist);
          const done = checklist.tasks.filter((t) => t.completed).length;
          return (
            <button
              key={checklist.id}
              className={`checklist-item ${checklist.id === selectedId ? 'selected' : ''}`}
              onClick={() => onSelect(checklist.id)}
            >
              <div className="checklist-item-top">
                <span className="checklist-item-title">{checklist.title}</span>
              </div>
              <ProgressBar value={progress} />
              <span className="checklist-item-meta">
                {done}/{checklist.tasks.length} tasks · {progress}%
              </span>
            </button>
          );
        })}
      </nav>

      {importError && (
        <div className="import-error" role="alert">
          <span>{importError}</span>
          <button className="btn btn-ghost" onClick={onDismissImportError}>
            ✕
          </button>
        </div>
      )}

      {canManage && (
        <footer className="sidebar-footer">
          <button className="btn btn-primary" onClick={onNewChecklist}>
            + New checklist
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={importing}
          >
            {importing ? 'Importing…' : '⇪ Import'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.xlsx,.csv,.txt"
            hidden
            onChange={handleFileChange}
          />
        </footer>
      )}
    </aside>
  );
}
