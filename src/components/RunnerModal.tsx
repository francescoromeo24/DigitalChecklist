import { useState } from 'react';
import TaskItem from './TaskItem';
import ProgressBar from './ProgressBar';
import type { Checklist, Task, User } from '../types';

interface Props {
  checklist: Checklist;
  users: User[];
  currentUser: User;
  onUpdateTask: (taskId: string, changes: Partial<Task>) => void;
  onClose: () => void;
}

/** Guides the operator through the checklist one step at a time. */
export default function RunnerModal({
  checklist,
  users,
  currentUser,
  onUpdateTask,
  onClose
}: Props) {
  const [index, setIndex] = useState(0);
  const tasks = checklist.tasks;
  const task = tasks[index];
  const done = tasks.filter((t) => t.completed).length;

  if (!task) {
    return null;
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal runner-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>
            ▶ {checklist.title} — step {index + 1} of {tasks.length}
          </h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="modal-body">
          <ProgressBar value={tasks.length ? Math.round((done / tasks.length) * 100) : 0} />
          <TaskItem
            key={task.id}
            task={task}
            users={users}
            members={[]}
            canManage={false}
            currentUserId={currentUser.id}
            defaultExpanded
            onUpdate={(changes) => onUpdateTask(task.id, changes)}
          />
          <div className="modal-actions runner-nav">
            <button
              className="btn btn-secondary"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              disabled={index === 0}
            >
              ← Back
            </button>
            {index < tasks.length - 1 ? (
              <button className="btn btn-primary" onClick={() => setIndex((i) => i + 1)}>
                Next →
              </button>
            ) : (
              <button className="btn btn-primary" onClick={onClose}>
                ✓ Finish
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
