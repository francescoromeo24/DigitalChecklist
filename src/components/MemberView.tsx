import TaskItem from './TaskItem';
import ProgressBar from './ProgressBar';
import type { AppNotification, Checklist, Task, User } from '../types';

interface Props {
  user: User;
  checklists: Checklist[];
  selectedId: string | null;
  notifications: AppNotification[];
  onMarkRead: (id: string) => void;
  onChange: (checklist: Checklist) => void;
}

export default function MemberView({
  user,
  checklists,
  selectedId,
  notifications,
  onMarkRead,
  onChange
}: Props) {
  const unread = notifications.filter((n) => !n.read);
  const withMyTasks = checklists
    .map((checklist) => ({
      checklist,
      myTasks: checklist.tasks.filter((t) => t.assigneeId === user.id)
    }))
    .filter(({ myTasks }) => myTasks.length > 0)
    .filter(({ checklist }) => !selectedId || checklist.id === selectedId);

  const allMine: Task[] = checklists.flatMap((c) =>
    c.tasks.filter((t) => t.assigneeId === user.id)
  );
  const doneMine = allMine.filter((t) => t.completed).length;

  const updateTask = (checklist: Checklist, taskId: string, changes: Partial<Task>) => {
    onChange({
      ...checklist,
      tasks: checklist.tasks.map((t) => (t.id === taskId ? { ...t, ...changes } : t))
    });
  };

  return (
    <div className="checklist-panel member-view">
      <header className="panel-header">
        <div className="panel-title">
          <h1>My tasks</h1>
          <span className="panel-subtitle">
            {doneMine}/{allMine.length} assigned tasks completed
          </span>
        </div>
      </header>
      <ProgressBar
        value={allMine.length === 0 ? 0 : Math.round((doneMine / allMine.length) * 100)}
      />

      {unread.length > 0 && (
        <div className="member-notifications">
          {unread.map((n) => (
            <div key={n.id} className={`notif-card priority-${n.priority}`}>
              <p>{n.message}</p>
              <button className="btn btn-ghost" onClick={() => onMarkRead(n.id)}>
                ✓ Read
              </button>
            </div>
          ))}
        </div>
      )}

      {withMyTasks.length === 0 && (
        <div className="empty-state">
          <h2>Nothing assigned yet</h2>
          <p>When a supervisor assigns tasks to you, they will appear here.</p>
        </div>
      )}

      <div className="task-list">
        {withMyTasks.map(({ checklist, myTasks }) => (
          <section key={checklist.id} className="member-section">
            <h3 className="member-section-title">{checklist.title}</h3>
            {myTasks.map((task) => (
              <TaskItem
                key={task.id}
                task={task}
                users={[user]}
                members={[]}
                canManage={false}
                currentUserId={user.id}
                onUpdate={(changes) => updateTask(checklist, task.id, changes)}
              />
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
