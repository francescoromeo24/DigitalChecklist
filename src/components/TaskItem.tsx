import { ChangeEvent, useRef, useState } from 'react';
import type { Task, TaskKind, User } from '../types';
import { taskFailed } from '../types';

interface Props {
  task: Task;
  users: User[];
  members: User[];
  canManage: boolean;
  currentUserId: string;
  /** Open the detail area immediately (used by the step-by-step runner). */
  defaultExpanded?: boolean;
  onUpdate: (changes: Partial<Task>) => void;
  onDelete?: () => void;
}

/** Downscale an image file and return it as a compact JPEG data URL. */
function fileToDataUrl(file: File, maxDim = 900): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Not a readable image'));
      img.onload = () => {
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.8));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}

const KIND_LABELS: Record<TaskKind, string> = {
  check: 'Checkbox',
  passfail: 'Pass / Fail',
  number: 'Number reading'
};

export default function TaskItem({
  task,
  users,
  members,
  canManage,
  currentUserId,
  defaultExpanded = false,
  onUpdate,
  onDelete
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(task.title);
  const [manuallyExpanded, setManuallyExpanded] = useState(defaultExpanded);
  const [valueDraft, setValueDraft] = useState<string>(task.value?.toString() ?? '');
  const photoInputRef = useRef<HTMLInputElement>(null);

  const kind: TaskKind = task.kind ?? 'check';
  const failed = taskFailed(task);
  const needsEvidence = failed && (task.photos?.length ?? 0) === 0;
  // Conditional logic: a failed check auto-opens the detail area to collect evidence.
  const expanded = manuallyExpanded || needsEvidence;

  const completedBy = task.completedBy
    ? users.find((u) => u.id === task.completedBy)?.name
    : undefined;

  const stampDone = (done: boolean) => ({
    completed: done,
    completedBy: done ? currentUserId : undefined,
    completedAt: done ? new Date().toISOString() : undefined
  });

  const commitRename = () => {
    const title = draft.trim();
    if (title && title !== task.title) onUpdate({ title });
    setEditing(false);
  };

  const setResult = (result: 'pass' | 'fail') => {
    if (task.result === result) {
      onUpdate({ result: undefined, ...stampDone(false) });
    } else {
      onUpdate({ result, ...stampDone(true) });
    }
  };

  const commitValue = () => {
    if (valueDraft.trim() === '') {
      onUpdate({ value: undefined, ...stampDone(false) });
      return;
    }
    const value = Number(valueDraft);
    if (!Number.isNaN(value)) {
      onUpdate({ value, ...stampDone(true) });
    }
  };

  const addPhoto = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const dataUrl = await fileToDataUrl(file);
      onUpdate({ photos: [...(task.photos ?? []), dataUrl] });
    } catch {
      // Non-image file selected; nothing to attach.
    }
  };

  const removePhoto = (index: number) => {
    onUpdate({ photos: (task.photos ?? []).filter((_, i) => i !== index) });
  };

  const boundsLabel =
    kind === 'number' && (task.min !== undefined || task.max !== undefined)
      ? `allowed ${task.min ?? '−∞'} – ${task.max ?? '+∞'}`
      : null;

  return (
    <div
      className={`task-item ${task.completed ? 'completed' : ''} ${task.flagged ? 'flagged' : ''} ${failed ? 'failed' : ''} ${task.isCorrective ? 'corrective' : ''}`}
    >
      <div className="task-row">
        {kind === 'check' && (
          <label className="task-check">
            <input
              type="checkbox"
              checked={task.completed}
              onChange={() => onUpdate(stampDone(!task.completed))}
            />
            <span className="task-checkmark" aria-hidden="true" />
          </label>
        )}
        {kind === 'passfail' && (
          <div className="passfail-group" role="group" aria-label="Pass or fail">
            <button
              className={`pf-btn pass ${task.result === 'pass' ? 'active' : ''}`}
              onClick={() => setResult('pass')}
              title="Mark as passed"
            >
              ✓
            </button>
            <button
              className={`pf-btn fail ${task.result === 'fail' ? 'active' : ''}`}
              onClick={() => setResult('fail')}
              title="Mark as failed"
            >
              ✗
            </button>
          </div>
        )}
        {kind === 'number' && (
          <input
            className={`task-number-input ${failed ? 'out-of-bounds' : ''}`}
            type="number"
            value={valueDraft}
            placeholder="—"
            onChange={(e) => setValueDraft(e.target.value)}
            onBlur={commitValue}
            onKeyDown={(e) => e.key === 'Enter' && commitValue()}
            title={boundsLabel ?? 'Enter reading'}
          />
        )}

        <div className="task-body">
          {editing && canManage ? (
            <input
              className="task-rename-input"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitRename();
                if (e.key === 'Escape') {
                  setDraft(task.title);
                  setEditing(false);
                }
              }}
              autoFocus
            />
          ) : (
            <span
              className="task-title"
              onDoubleClick={() => canManage && setEditing(true)}
              title={canManage ? 'Double-click to rename' : undefined}
            >
              {task.isCorrective && <span className="corrective-badge">CORRECTIVE</span>}
              {task.title}
            </span>
          )}
          <span className="task-meta">
            {failed && <span className="fail-label">✗ FAILED </span>}
            {boundsLabel && <span>{boundsLabel} · </span>}
            {task.completed && task.completedAt && (
              <>
                {failed ? 'Checked' : 'Completed'}
                {completedBy ? ` by ${completedBy}` : ''} on{' '}
                {new Date(task.completedAt).toLocaleString()}
              </>
            )}
          </span>
        </div>

        {canManage && (
          <select
            className="task-assignee"
            value={task.assigneeId ?? ''}
            onChange={(e) => onUpdate({ assigneeId: e.target.value || undefined })}
            title="Assign to member"
          >
            <option value="">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.position ? ` — ${m.position}` : ''}
              </option>
            ))}
          </select>
        )}

        <button
          className={`task-flag-btn ${task.flagged ? 'active' : ''}`}
          onClick={() => onUpdate({ flagged: !task.flagged })}
          title={task.flagged ? 'Remove flag' : 'Flag task'}
        >
          ⚑
        </button>

        <button
          className={`task-expand-btn ${expanded ? 'open' : ''}`}
          onClick={() => setManuallyExpanded((v) => !v)}
          title="Details, instructions and photos"
          aria-expanded={expanded}
        >
          ▾
        </button>

        {canManage && onDelete && (
          <button className="task-delete-btn" onClick={onDelete} title="Delete task">
            ✕
          </button>
        )}
      </div>

      {expanded && (
        <div className="task-detail">
          {needsEvidence && (
            <div className="evidence-prompt" role="alert">
              ⚠ This check failed — please add photo evidence and a note describing the problem.
            </div>
          )}

          {(task.instructions || canManage) && (
            <label className="detail-field">
              <span>Instructions</span>
              {canManage ? (
                <textarea
                  defaultValue={task.instructions ?? ''}
                  rows={2}
                  placeholder="Step-by-step guidance for the operator…"
                  onBlur={(e) => {
                    const instructions = e.target.value.trim() || undefined;
                    if (instructions !== task.instructions) onUpdate({ instructions });
                  }}
                />
              ) : (
                <p className="detail-text">{task.instructions}</p>
              )}
            </label>
          )}

          {(task.link || canManage) && (
            <label className="detail-field">
              <span>Reference link</span>
              {canManage ? (
                <input
                  type="url"
                  defaultValue={task.link ?? ''}
                  placeholder="https://… (manual, diagram, video)"
                  onBlur={(e) => {
                    const link = e.target.value.trim() || undefined;
                    if (link !== task.link) onUpdate({ link });
                  }}
                />
              ) : null}
              {task.link && (
                <a href={task.link} target="_blank" rel="noreferrer" className="detail-link">
                  🔗 {task.link}
                </a>
              )}
            </label>
          )}

          {canManage && (
            <div className="detail-row">
              <label className="detail-field">
                <span>Check type</span>
                <select
                  value={kind}
                  onChange={(e) => {
                    const nextKind = e.target.value as TaskKind;
                    onUpdate({
                      kind: nextKind,
                      result: undefined,
                      value: undefined,
                      ...stampDone(false)
                    });
                    setValueDraft('');
                  }}
                >
                  {(Object.keys(KIND_LABELS) as TaskKind[]).map((k) => (
                    <option key={k} value={k}>
                      {KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
              {kind === 'number' && (
                <>
                  <label className="detail-field">
                    <span>Min allowed</span>
                    <input
                      type="number"
                      defaultValue={task.min ?? ''}
                      onBlur={(e) =>
                        onUpdate({ min: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                    />
                  </label>
                  <label className="detail-field">
                    <span>Max allowed</span>
                    <input
                      type="number"
                      defaultValue={task.max ?? ''}
                      onBlur={(e) =>
                        onUpdate({ max: e.target.value === '' ? undefined : Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}
            </div>
          )}

          <div className="detail-field">
            <span>Photos {needsEvidence ? '(evidence required)' : ''}</span>
            <div className="photo-strip">
              {(task.photos ?? []).map((photo, i) => (
                <div key={i} className="photo-thumb">
                  <img src={photo} alt={`Photo ${i + 1} for ${task.title}`} />
                  <button onClick={() => removePhoto(i)} title="Remove photo">
                    ✕
                  </button>
                </div>
              ))}
              <button
                className={`btn ${needsEvidence ? 'btn-primary' : 'btn-secondary'} photo-add`}
                onClick={() => photoInputRef.current?.click()}
              >
                📷 Add photo
              </button>
              <input
                ref={photoInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={addPhoto}
              />
            </div>
          </div>

          <label className="detail-field">
            <span>Note</span>
            <textarea
              defaultValue={task.note ?? ''}
              rows={2}
              placeholder="Observations, defects, abnormal conditions…"
              onBlur={(e) => {
                const note = e.target.value.trim() || undefined;
                if (note !== task.note) onUpdate({ note });
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}
