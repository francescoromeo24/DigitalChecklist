import { FormEvent, useEffect, useRef, useState } from 'react';
import { aiService, buildChecklist, tasksForTopic, topicOptions } from '../services/aiService';
import { storageService } from '../services/storageService';
import type { ChatMessage, User } from '../types';
import { newId } from '../types';

interface Props {
  user: User;
  members: User[];
  onChecklistCreated: (checklistId: string) => void;
}

/** State of the guided checklist-building conversation. */
interface Flow {
  stage: 'topic' | 'customTitle' | 'count' | 'due' | 'assignee';
  title?: string;
  taskTitles?: string[];
  count?: number;
  dueDate?: string;
}

function assistantMessage(
  text: string,
  options?: { label: string; value: string }[]
): ChatMessage {
  return { id: newId(), sender: 'assistant', text, options, timestamp: new Date().toISOString() };
}

export default function AIAssistant({ user, members, onChecklistCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const [flow, setFlow] = useState<Flow | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    assistantMessage(
      `Hi ${user.name.split(' ')[0]}! I'm your checklist assistant. I can build a checklist with you step by step, or you can just describe what you need in your own words.`,
      [{ label: '🧭 Build a checklist step by step', value: '__start_guided__' }]
    )
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, open, thinking]);

  const say = (message: ChatMessage) => setMessages((prev) => [...prev, message]);

  const askTopic = () => {
    setFlow({ stage: 'topic' });
    say(
      assistantMessage(
        'Great — what is the checklist for? Pick one, or choose "Something else" to describe your own.',
        topicOptions().map((t) => ({ label: t.label, value: `topic:${t.key}` }))
      )
    );
  };

  const askCount = (title: string, taskTitles: string[]) => {
    setFlow({ stage: 'count', title, taskTitles });
    say(
      assistantMessage(
        `"${title}" it is. I have ${taskTitles.length} suggested tasks — how many should I include?`,
        [
          { label: '5 tasks', value: 'count:5' },
          { label: '8 tasks', value: 'count:8' },
          { label: `All ${taskTitles.length}`, value: `count:${taskTitles.length}` }
        ]
      )
    );
  };

  const askDue = (current: Flow, count: number) => {
    setFlow({ ...current, stage: 'due', count });
    say(
      assistantMessage('Should this checklist have a due date?', [
        { label: 'Due today', value: 'due:today' },
        { label: 'Due next week', value: 'due:week' },
        { label: 'No due date', value: 'due:none' }
      ])
    );
  };

  const askAssigneeOrFinish = async (current: Flow, dueDate?: string) => {
    const next: Flow = { ...current, stage: 'assignee', dueDate };
    if (members.length === 0) {
      await finishGuided(next, undefined);
      return;
    }
    setFlow(next);
    say(
      assistantMessage('Should I assign all its tasks to a team member?', [
        { label: 'No, leave unassigned', value: 'assign:none' },
        ...members.map((m) => ({ label: `${m.name} (${m.role})`, value: `assign:${m.id}` }))
      ])
    );
  };

  const finishGuided = async (current: Flow, assigneeId?: string) => {
    const checklist = buildChecklist({
      title: current.title ?? 'New Checklist',
      taskTitles: current.taskTitles ?? [],
      count: current.count ?? current.taskTitles?.length ?? 0,
      dueDate: current.dueDate,
      assigneeId
    });
    const saved = await storageService.saveChecklist({ ...checklist, createdBy: user.id });
    onChecklistCreated(saved.id);
    setFlow(null);
    const assignee = assigneeId ? members.find((m) => m.id === assigneeId)?.name : undefined;
    say(
      assistantMessage(
        `Done! I created "${saved.title}" with ${saved.tasks.length} tasks` +
          (saved.dueDate ? `, due ${new Date(saved.dueDate).toLocaleDateString()}` : '') +
          (assignee ? `, all assigned to ${assignee}` : '') +
          `. It's selected in your dashboard now — want to build another one?`,
        [{ label: '🧭 Build another checklist', value: '__start_guided__' }]
      )
    );
  };

  /** Route one user utterance (typed text or a clicked choice value). */
  const process = async (value: string, displayText: string) => {
    say({ id: newId(), sender: 'user', text: displayText, timestamp: new Date().toISOString() });
    setThinking(true);
    await new Promise((resolve) => setTimeout(resolve, 400));
    try {
      if (value === '__start_guided__') {
        askTopic();
        return;
      }

      if (flow?.stage === 'topic' && value.startsWith('topic:')) {
        const key = value.slice('topic:'.length);
        if (key === '__custom__') {
          setFlow({ stage: 'customTitle' });
          say(assistantMessage('Tell me in a few words what the checklist is about — e.g. "opening the shop" or "monthly report".'));
        } else {
          const { title, tasks } = tasksForTopic(key);
          askCount(title, tasks);
        }
        return;
      }

      if (flow?.stage === 'customTitle') {
        const title = displayText.charAt(0).toUpperCase() + displayText.slice(1);
        const { tasks } = tasksForTopic('__custom__');
        askCount(title, tasks);
        return;
      }

      if (flow?.stage === 'count') {
        const n = parseInt(value.startsWith('count:') ? value.slice(6) : value, 10);
        if (Number.isNaN(n) || n < 1) {
          say(assistantMessage('Please pick one of the options or type a number of tasks.'));
          return;
        }
        askDue(flow, Math.min(n, flow.taskTitles?.length ?? n));
        return;
      }

      if (flow?.stage === 'due') {
        let dueDate: string | undefined;
        if (value === 'due:today') dueDate = new Date().toISOString().slice(0, 10);
        else if (value === 'due:week') {
          const d = new Date();
          d.setDate(d.getDate() + 7);
          dueDate = d.toISOString().slice(0, 10);
        } else if (value !== 'due:none') {
          const parsed = new Date(displayText);
          if (!Number.isNaN(parsed.getTime())) dueDate = parsed.toISOString().slice(0, 10);
        }
        await askAssigneeOrFinish(flow, dueDate);
        return;
      }

      if (flow?.stage === 'assignee') {
        const assigneeId = value.startsWith('assign:') && value !== 'assign:none'
          ? value.slice('assign:'.length)
          : undefined;
        await finishGuided(flow, assigneeId);
        return;
      }

      // No guided flow active: fall back to free-text generation.
      const reply = aiService.generateReply(displayText);
      let checklistId: string | undefined;
      if (reply.checklist) {
        const saved = await storageService.saveChecklist({ ...reply.checklist, createdBy: user.id });
        checklistId = saved.id;
        onChecklistCreated(saved.id);
      }
      say({
        id: newId(),
        sender: 'assistant',
        text: reply.text,
        checklistId,
        timestamp: new Date().toISOString(),
        options: reply.checklist
          ? undefined
          : [{ label: '🧭 Build a checklist step by step', value: '__start_guided__' }]
      });
    } finally {
      setThinking(false);
    }
  };

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    await process(text, text);
  };

  const lastMessage = messages[messages.length - 1];

  return (
    <>
      <button
        className={`ai-fab ${open ? 'open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Close AI assistant' : 'Open AI assistant'}
        title="AI assistant"
      >
        {open ? '✕' : '✦'}
      </button>

      {open && (
        <div className="ai-panel" role="dialog" aria-label="AI assistant">
          <header className="ai-panel-header">
            <span className="ai-panel-title">✦ AI Assistant</span>
            <button className="btn btn-ghost" onClick={() => setOpen(false)} aria-label="Close">
              ✕
            </button>
          </header>

          <div className="ai-messages" ref={scrollRef}>
            {messages.map((message) => (
              <div key={message.id} className={`ai-message ${message.sender}`}>
                <div className="ai-bubble">
                  {message.text}
                  {message.options && message === lastMessage && !thinking && (
                    <div className="ai-options">
                      {message.options.map((option) => (
                        <button
                          key={option.value}
                          className="ai-option-chip"
                          onClick={() => process(option.value, option.label)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {thinking && (
              <div className="ai-message assistant">
                <div className="ai-bubble ai-thinking">Thinking…</div>
              </div>
            )}
          </div>

          <form className="ai-input-row" onSubmit={send}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type an answer or ask for a checklist…"
              disabled={thinking}
            />
            <button type="submit" className="btn btn-primary" disabled={thinking || !input.trim()}>
              Send
            </button>
          </form>
        </div>
      )}
    </>
  );
}
