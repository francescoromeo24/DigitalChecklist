import { FormEvent, useState } from 'react';
import type { Checklist, User } from '../types';
import { newId } from '../types';

interface Props {
  user: User;
  onCreate: (checklist: Checklist) => void;
  onClose: () => void;
}

export default function NewChecklistModal({ user, onCreate, onClose }: Props) {
  const [title, setTitle] = useState('');
  const [tasksText, setTasksText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const taskTitles = tasksText
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (taskTitles.length === 0) {
      setError('Add at least one task (one per line).');
      return;
    }
    const now = new Date().toISOString();
    onCreate({
      id: newId(),
      title: title.trim(),
      source: 'manual',
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
      dueDate: dueDate || undefined,
      tasks: taskTitles.map((t) => ({
        id: newId(),
        title: t,
        completed: false,
        flagged: false
      }))
    });
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>New checklist</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <form onSubmit={submit} className="modal-body">
          <label>
            Title
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Morning opening routine"
              required
              autoFocus
            />
          </label>
          <label>
            Tasks (one per line)
            <textarea
              value={tasksText}
              onChange={(e) => setTasksText(e.target.value)}
              rows={8}
              placeholder={'Unlock the front door\nTurn on the lights\nCheck the register'}
            />
          </label>
          <label>
            Due date (optional — makes the checklist "scheduled")
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Create checklist
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
