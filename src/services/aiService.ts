import type { Checklist, Task } from '../types';
import { newId } from '../types';

interface Template {
  keywords: string[];
  title: string;
  tasks: string[];
}

const TEMPLATES: Template[] = [
  {
    keywords: ['onboard', 'new hire', 'new employee', 'assunzione'],
    title: 'Employee Onboarding',
    tasks: [
      'Prepare workstation and equipment',
      'Create company email account and credentials',
      'Send welcome email with first-day details',
      'Schedule orientation session',
      'Introduce the new hire to the team',
      'Assign an onboarding buddy',
      'Review company policies and sign documents',
      'Set up payroll and benefits',
      'Grant access to required software and tools',
      'Schedule 30-day check-in meeting'
    ]
  },
  {
    keywords: ['clean', 'pulizia', 'housekeeping', 'sanit'],
    title: 'Cleaning Routine',
    tasks: [
      'Gather cleaning supplies and equipment',
      'Empty all trash bins and replace liners',
      'Dust surfaces, shelves and fixtures',
      'Wipe down desks and countertops',
      'Clean and disinfect restrooms',
      'Vacuum carpets and rugs',
      'Mop hard floors',
      'Clean windows and glass doors',
      'Restock consumables (soap, paper towels)',
      'Final inspection and sign-off'
    ]
  },
  {
    keywords: ['deploy', 'release', 'rilascio', 'production', 'launch'],
    title: 'Software Release',
    tasks: [
      'Freeze feature branch and tag release candidate',
      'Run full automated test suite',
      'Perform manual smoke tests on staging',
      'Review and update release notes',
      'Back up production database',
      'Notify stakeholders of deployment window',
      'Deploy to production',
      'Verify health checks and monitoring dashboards',
      'Run post-deployment smoke tests',
      'Announce release and close the milestone'
    ]
  },
  {
    keywords: ['event', 'evento', 'meeting', 'conference', 'workshop'],
    title: 'Event Preparation',
    tasks: [
      'Define event goals and agenda',
      'Book venue and confirm date',
      'Send invitations and track RSVPs',
      'Arrange catering and refreshments',
      'Prepare presentation materials',
      'Set up audio/video equipment',
      'Print badges and signage',
      'Brief staff and volunteers on roles',
      'Do a final venue walkthrough',
      'Send follow-up and collect feedback'
    ]
  },
  {
    keywords: ['safety', 'sicurezza', 'inspection', 'audit', 'ispezione'],
    title: 'Safety Inspection',
    tasks: [
      'Review previous inspection reports',
      'Check fire extinguishers and expiry dates',
      'Test smoke detectors and alarms',
      'Inspect emergency exits and signage',
      'Verify first aid kits are stocked',
      'Check electrical panels and cables',
      'Review PPE availability and condition',
      'Inspect storage areas for hazards',
      'Document findings with photos',
      'File inspection report and assign corrective actions'
    ]
  },
  {
    keywords: ['travel', 'viaggio', 'trip', 'packing'],
    title: 'Travel Preparation',
    tasks: [
      'Confirm travel dates and book transport',
      'Reserve accommodation',
      'Check passport and visa requirements',
      'Arrange travel insurance',
      'Prepare itinerary and share with contacts',
      'Pack luggage and essentials',
      'Check in online and download boarding passes',
      'Arrange airport transfer',
      'Set out-of-office reply',
      'Confirm return logistics'
    ]
  }
];

const GENERIC_TASKS = [
  'Define the goal and scope',
  'List required resources and materials',
  'Identify the people involved',
  'Break the work into concrete steps',
  'Set deadlines for each step',
  'Execute the first step',
  'Review intermediate progress',
  'Adjust the plan if needed',
  'Complete the remaining steps',
  'Do a final review and sign-off'
];

function wantsChecklist(prompt: string): boolean {
  return /(checklist|check list|list|task|elenco|lista|generate|create|crea|genera|make|plan|prepar)/i.test(
    prompt
  );
}

function extractTitle(prompt: string): string | null {
  const match = prompt.match(
    /(?:checklist|list|lista|elenco)\s+(?:for|about|per|di|su|on)\s+(.{3,60}?)(?:[.?!]|$)/i
  );
  if (match) {
    const raw = match[1].trim();
    return raw.charAt(0).toUpperCase() + raw.slice(1);
  }
  return null;
}

export interface AiReply {
  text: string;
  checklist?: Omit<Checklist, 'createdBy'>;
}

export interface TopicOption {
  key: string;
  label: string;
}

/** Topics offered as quick-reply choices in the guided conversation. */
export function topicOptions(): TopicOption[] {
  return [
    ...TEMPLATES.map((t) => ({ key: t.keywords[0], label: t.title })),
    { key: '__custom__', label: 'Something else…' }
  ];
}

/** Task suggestions for a chosen topic key (or generic steps for a custom topic). */
export function tasksForTopic(topicKey: string): { title: string; tasks: string[] } {
  const template = TEMPLATES.find((t) => t.keywords[0] === topicKey);
  if (template) return { title: template.title, tasks: template.tasks };
  return { title: 'New Checklist', tasks: GENERIC_TASKS };
}

/** Assemble a persistable checklist from the guided conversation's answers. */
export function buildChecklist(options: {
  title: string;
  taskTitles: string[];
  count: number;
  dueDate?: string;
  assigneeId?: string;
}): Omit<Checklist, 'createdBy'> {
  const now = new Date().toISOString();
  const count = Math.min(Math.max(options.count, 1), options.taskTitles.length);
  const tasks: Task[] = options.taskTitles.slice(0, count).map((t) => ({
    id: newId(),
    title: t,
    completed: false,
    flagged: false,
    assigneeId: options.assigneeId
  }));
  return {
    id: newId(),
    title: options.title,
    source: 'ai',
    createdAt: now,
    updatedAt: now,
    dueDate: options.dueDate,
    tasks
  };
}

export const aiService = {
  generateReply(prompt: string): AiReply {
    const normalized = prompt.toLowerCase();

    if (!wantsChecklist(normalized)) {
      return {
        text:
          'I can generate checklists for you. Try something like: ' +
          '"Create a checklist for onboarding a new employee", ' +
          '"Generate a cleaning checklist", or ' +
          '"Make a checklist for our product launch".'
      };
    }

    const template = TEMPLATES.find((t) =>
      t.keywords.some((keyword) => normalized.includes(keyword))
    );
    const title = extractTitle(prompt) ?? template?.title ?? 'New Checklist';
    const taskTitles = template?.tasks ?? GENERIC_TASKS;

    const countMatch = normalized.match(/(\d{1,2})\s*(?:tasks?|steps?|item|voci|passi)/);
    const count = countMatch
      ? Math.min(Math.max(parseInt(countMatch[1], 10), 1), taskTitles.length)
      : taskTitles.length;

    const now = new Date().toISOString();
    const tasks: Task[] = taskTitles.slice(0, count).map((t) => ({
      id: newId(),
      title: t,
      completed: false,
      flagged: false
    }));

    return {
      text: `I created the checklist "${title}" with ${tasks.length} tasks. You can find it in your checklist list — select it to review, assign, and track the tasks.`,
      checklist: {
        id: newId(),
        title,
        source: 'ai',
        createdAt: now,
        updatedAt: now,
        tasks
      }
    };
  }
};
