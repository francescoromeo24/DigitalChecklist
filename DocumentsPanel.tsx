import { ChangeEvent, FormEvent, useRef, useState } from 'react';
import { storageService } from '../services/storageService';
import type { AppDocument, User } from '../types';
import { newId } from '../types';

interface Props {
  documents: AppDocument[];
  users: User[];
  currentUser: User;
  canManage: boolean;
  onChanged: () => Promise<void> | void;
}

function formatSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileIcon(doc: AppDocument): string {
  const source = doc.mime ?? doc.fileName ?? '';
  if (source.includes('pdf')) return '📕';
  if (source.includes('image') || /\.(png|jpe?g|gif|svg)$/i.test(source)) return '🖼';
  if (source.includes('sheet') || /\.(xlsx?|csv)$/i.test(source)) return '📊';
  if (source.includes('video')) return '🎬';
  if (doc.link && !doc.fileName) return '🔗';
  return '📄';
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

export default function DocumentsPanel({
  documents,
  users,
  currentUser,
  canManage,
  onChanged
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [link, setLink] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pickFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    setError(null);
    setPendingFiles(files);
    if (files.length === 1 && !title.trim()) {
      setTitle(files[0].name.replace(/\.[^.]+$/, ''));
    }
  };

  const addDocuments = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pendingFiles.length === 0 && !link.trim()) {
      setError('Attach one or more files, or provide a link.');
      return;
    }
    setSaving(true);
    try {
      if (pendingFiles.length > 0) {
        for (const file of pendingFiles) {
          await storageService.saveDocument({
            id: newId(),
            title:
              pendingFiles.length === 1 && title.trim()
                ? title.trim()
                : file.name.replace(/\.[^.]+$/, ''),
            description: description.trim() || undefined,
            fileName: file.name,
            mime: file.type,
            size: file.size,
            dataUrl: await readAsDataUrl(file),
            link: pendingFiles.length === 1 ? link.trim() || undefined : undefined,
            uploadedBy: currentUser.id,
            uploadedAt: new Date().toISOString()
          });
        }
      } else {
        await storageService.saveDocument({
          id: newId(),
          title: title.trim() || link.trim(),
          description: description.trim() || undefined,
          link: link.trim(),
          uploadedBy: currentUser.id,
          uploadedAt: new Date().toISOString()
        });
      }
      const added = pendingFiles.length > 0 ? pendingFiles.length : 1;
      await storageService.addAudit({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Added documentation',
        detail: `${added} item${added > 1 ? 's' : ''}`
      });
      setTitle('');
      setDescription('');
      setLink('');
      setPendingFiles([]);
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the documents.');
    } finally {
      setSaving(false);
    }
  };

  const openDocument = (doc: AppDocument) => {
    if (doc.dataUrl) {
      const a = document.createElement('a');
      a.href = doc.dataUrl;
      a.download = doc.fileName ?? doc.title;
      a.click();
    } else if (doc.link) {
      window.open(doc.link, '_blank', 'noopener');
    }
  };

  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = documents.length > 0 && selected.size === documents.length;

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(documents.map((d) => d.id)));
  };

  const removeDocument = async (doc: AppDocument) => {
    if (window.confirm(`Delete document "${doc.title}"?`)) {
      await storageService.deleteDocument(doc.id);
      await storageService.addAudit({
        userId: currentUser.id,
        userName: currentUser.name,
        action: 'Deleted documentation',
        detail: doc.title
      });
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(doc.id);
        return next;
      });
      await onChanged();
    }
  };

  const removeSelected = async () => {
    if (selected.size === 0) return;
    if (window.confirm(`Delete ${selected.size} selected document(s)? This cannot be undone.`)) {
      for (const id of selected) {
        await storageService.deleteDocument(id);
      }
      setSelected(new Set());
      await onChanged();
    }
  };

  return (
    <div className="checklist-panel documents-panel">
      <header className="panel-header">
        <div className="panel-title">
          <h1>📁 Documentation</h1>
          <span className="panel-subtitle">
            Manuals, procedures, diagrams and reference material for the whole team
          </span>
        </div>
        {canManage && documents.length > 0 && (
          <div className="panel-actions doc-bulk-actions">
            <label className="doc-select-all">
              <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} />
              Select all
            </label>
            <button
              className="btn btn-secondary"
              onClick={removeSelected}
              disabled={selected.size === 0}
            >
              🗑 Delete selected{selected.size > 0 ? ` (${selected.size})` : ''}
            </button>
          </div>
        )}
      </header>

      <div className="documents-scroll">
        {documents.length === 0 && (
          <div className="empty-state">
            <h2>No documents yet</h2>
            <p>
              {canManage
                ? 'Import manuals, procedures, or diagrams below — you can select several files at once.'
                : 'When your supervisor uploads manuals or procedures, they will appear here.'}
            </p>
          </div>
        )}

        <div className="document-list">
          {documents.map((doc) => {
            const uploader = users.find((u) => u.id === doc.uploadedBy)?.name ?? 'Unknown';
            return (
              <div
                key={doc.id}
                className={`document-card ${selected.has(doc.id) ? 'selected' : ''}`}
              >
                {canManage && (
                  <input
                    type="checkbox"
                    className="doc-select"
                    checked={selected.has(doc.id)}
                    onChange={() => toggleSelected(doc.id)}
                    aria-label={`Select ${doc.title}`}
                  />
                )}
                <span className="document-icon">{fileIcon(doc)}</span>
                <div className="document-info">
                  <strong>{doc.title}</strong>
                  {doc.description && <p>{doc.description}</p>}
                  <span className="document-meta">
                    {doc.fileName && `${doc.fileName} · ${formatSize(doc.size)} · `}
                    added by {uploader} on {new Date(doc.uploadedAt).toLocaleDateString()}
                  </span>
                  {doc.link && (
                    <a href={doc.link} target="_blank" rel="noreferrer" className="detail-link">
                      🔗 {doc.link}
                    </a>
                  )}
                </div>
                <div className="document-actions">
                  {doc.dataUrl && (
                    <button className="btn btn-secondary" onClick={() => openDocument(doc)}>
                      ⬇ Download
                    </button>
                  )}
                  {!doc.dataUrl && doc.link && (
                    <button className="btn btn-secondary" onClick={() => openDocument(doc)}>
                      ↗ Open
                    </button>
                  )}
                  {canManage && (
                    <button
                      className="btn btn-ghost danger"
                      onClick={() => removeDocument(doc)}
                      title="Delete document"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {canManage && (
        <form className="document-form" onSubmit={addDocuments}>
          <h3>Import documentation</h3>
          <div className="document-form-row">
            <input
              type="text"
              placeholder={
                pendingFiles.length > 1
                  ? 'Titles taken from file names when importing several files'
                  : 'Title (e.g. Machine manual, Safety procedure)'
              }
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={pendingFiles.length > 1}
            />
            <input
              type="url"
              placeholder="Link (optional) — https://…"
              value={link}
              onChange={(e) => setLink(e.target.value)}
            />
          </div>
          <input
            type="text"
            placeholder="Short description (optional, applied to all)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="document-form-row">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
            >
              {pendingFiles.length === 0
                ? '📎 Choose files'
                : pendingFiles.length === 1
                  ? `📎 ${pendingFiles[0].name}`
                  : `📎 ${pendingFiles.length} files selected`}
            </button>
            <input ref={fileInputRef} type="file" multiple hidden onChange={pickFiles} />
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving
                ? 'Importing…'
                : pendingFiles.length > 1
                  ? `+ Import ${pendingFiles.length} documents`
                  : '+ Add document'}
            </button>
          </div>
          {error && <p className="form-error">{error}</p>}
        </form>
      )}
    </div>
  );
}
