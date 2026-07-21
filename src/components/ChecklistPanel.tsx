import { FormEvent, useEffect, useRef, useState } from 'react';
import ProgressBar from './ProgressBar';
import TaskItem from './TaskItem';
import RunnerModal from './RunnerModal';
import SignatureModal from './SignatureModal';
import { exportService } from '../services/exportService';
import type { Checklist, Task, User } from '../types';
import { checklistProgress, checklistStatus, newId } from '../types';

interface Props {
  checklist: Checklist;
  users: User[];
  currentUser: User;
  onChange: (checklist: Checklist) => void;
  onDelete: () => void;
}

type Filter = 'all' | 'pending' | 'completed' | 'flagged';

export default function ChecklistPanel({
  checklist,
  users,
  currentUser,
  onChange,
  onDelete
}: Props) {
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showRunner, setShowRunner] = useState(false);
  const [showSignature, setShowSignature] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const members = users.filter((u) => u.role === 'member');
  const progress = checklistProgress(checklist);
  const doneCount = checklist.tasks.filter((t) => t.completed).length;
  const flaggedCount = checklist.tasks.filter((t) => t.flagged).length;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const updateTasks = (mapper: (tasks: Task[]) => Task[]) => {
    onChange({ ...checklist, tasks: mapper(checklist.tasks) });
  };

  const updateTask = (taskId: string, changes: Partial<Task>) => {
    updateTasks((tasks) =>
      tasks.map((t) => (t.id === taskId ? { ...t, ...changes } : t))
    );
  };

  const addTask = (e: FormEvent) => {
    e.preventDefault();
    const title = newTaskTitle.trim();
    if (!title) return;
    updateTasks((tasks) => [
      ...tasks,
      { id: newId(), title, completed: false, flagged: false }
    ]);
    setNewTaskTitle('');
  };

  const bulk = {
    completeAll: () =>
      updateTasks((tasks) =>
        tasks.map((t) =>
          t.completed
            ? t
            : {
                ...t,
                completed: true,
                completedBy: currentUser.id,
                completedAt: new Date().toISOString()
              }
        )
      ),
    uncompleteAll: () =>
      updateTasks((tasks) =>
        tasks.map((t) => ({
          ...t,
          completed: false,
          completedBy: undefined,
          completedAt: undefined
        }))
      ),
    flagAll: () => updateTasks((tasks) => tasks.map((t) => ({ ...t, flagged: true }))),
    unflagAll: () => updateTasks((tasks) => tasks.map((t) => ({ ...t, flagged: false }))),
    deleteCompleted: () => {
      if (doneCount === 0) return;
      if (window.confirm(`Delete ${doneCount} completed task(s)?`)) {
        updateTasks((tasks) => tasks.filter((t) => !t.completed));
      }
    }
  };

  const visibleTasks = checklist.tasks.filter((t) => {
    if (filter === 'pending') return !t.completed;
    if (filter === 'completed') return t.completed;
    if (filter === 'flagged') return t.flagged;
    return true;
  });

  return (
    <div className="checklist-panel">
      <header className="panel-header">
        <div className="panel-title">
          <h1>{checklist.title}</h1>
          <span className="panel-subtitle">
            <span className={`status-chip status-${checklistStatus(checklist)}`}>
              {checklistStatus(checklist)}
            </span>{' '}
            {doneCount}/{checklist.tasks.length} tasks completed · {progress}%
            {checklist.dueDate && (
              <span> · due {new Date(checklist.dueDate).toLocaleDateString()}</span>
            )}
            {flaggedCount > 0 && (
              <span className="flag-count"> · ⚑ {flaggedCount} flagged</span>
            )}
            {checklist.signature && (
              <span className="signed-chip">
                ✍ Signed by {checklist.signature.name} on{' '}
                {new Date(checklist.signature.signedAt).toLocaleString()}
              </span>
            )}
          </span>
        </div>
        <div className="panel-actions" ref={menuRef}>
          {checklist.tasks.length > 0 && (
            <button className="btn btn-primary" onClick={() => setShowRunner(true)}>
              ▶ Run
            </button>
          )}
          {progress === 100 && !checklist.signature && (
            <button className="btn btn-secondary" onClick={() => setShowSignature(true)}>
              ✍ Sign off
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
          >
            Actions ▾
          </button>
          {menuOpen && (
            <div className="dropdown-menu" role="menu">
              <button
                role="menuitem"
                onClick={() => {
                  exportService.exportPdf(checklist, users);
                  setMenuOpen(false);
                }}
              >
                📄 Export PDF summary
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  exportService.emailSummary(checklist, users);
                  setMenuOpen(false);
                }}
              >
                ✉️ Send email summary
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  exportService.exportJson(checklist, users);
                  setMenuOpen(false);
                }}
              >
                🗂 Export JSON (CMMS / ERP)
              </button>
              <button
                role="menuitem"
                onClick={() => {
                  exportService.exportCsv(checklist, users);
                  setMenuOpen(false);
                }}
              >
                📊 Export CSV
              </button>
              <button
                role="menuitem"
                className="danger"
                onClick={() => {
                  setMenuOpen(false);
                  if (window.confirm(`Delete checklist "${checklist.title}"?`)) {
                    onDelete();
                  }
                }}
              >
                🗑 Delete checklist
              </button>
            </div>
          )}
        </div>
      </header>

      <ProgressBar value={progress} />

      <div className="bulk-bar">
        <div className="filter-group" role="tablist" aria-label="Filter tasks">
          {(['all', 'pending', 'completed', 'flagged'] as Filter[]).map((f) => (
            <button
              key={f}
              role="tab"
              aria-selected={filter === f}
              className={`filter-chip ${filter === f ? 'active' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
        <div className="bulk-actions">
          <button className="btn btn-ghost" onClick={bulk.completeAll}>
            ✓ Complete all
          </button>
          <button className="btn btn-ghost" onClick={bulk.uncompleteAll}>
            ↺ Reset all
          </button>
          <button className="btn btn-ghost" onClick={bulk.flagAll}>
            ⚑ Flag all
          </button>
          <button className="btn btn-ghost" onClick={bulk.unflagAll}>
            ⚐ Unflag all
          </button>
          <button className="btn btn-ghost danger" onClick={bulk.deleteCompleted}>
            🗑 Delete completed
          </button>
        </div>
      </div>

      <div className="task-list">
        {visibleTasks.length === 0 && (
          <p className="task-list-empty">No tasks match this filter.</p>
        )}
        {visibleTasks.map((task) => (
          <TaskItem
            key={task.id}
            task={task}
            users={users}
            members={members}
            canManage
            currentUserId={currentUser.id}
            onUpdate={(changes) => updateTask(task.id, changes)}
            onDelete={() =>
              updateTasks((tasks) => tasks.filter((t) => t.id !== task.id))
            }
          />
        ))}
      </div>

      <form className="add-task-form" onSubmit={addTask}>
        <input
          type="text"
          value={newTaskTitle}
          onChange={(e) => setNewTaskTitle(e.target.value)}
          placeholder="Add a new task…"
        />
        <button type="submit" className="btn btn-primary">
          Add
        </button>
      </form>

      {showRunner && (
        <RunnerModal
          checklist={checklist}
          users={users}
          currentUser={currentUser}
          onUpdateTask={updateTask}
          onClose={() => setShowRunner(false)}
        />
      )}

      {showSignature && (
        <SignatureModal
          checklist={checklist}
          currentUser={currentUser}
          onSign={(signature) => {
            onChange({ ...checklist, signature });
            setShowSignature(false);
          }}
          onClose={() => setShowSignature(false)}
        />
      )}
    </div>
  );
}
