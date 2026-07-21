import { describe, expect, it } from 'vitest';
import { aiService, buildChecklist, tasksForTopic, topicOptions } from './aiService';

describe('aiService.generateReply', () => {
  it('returns guidance (no checklist) when the prompt is not a request', () => {
    const reply = aiService.generateReply('hello there');
    expect(reply.checklist).toBeUndefined();
    expect(reply.text.length).toBeGreaterThan(0);
  });

  it('generates a checklist from a known template keyword', () => {
    const reply = aiService.generateReply('create a checklist for onboarding a new employee');
    expect(reply.checklist).toBeDefined();
    expect(reply.checklist!.tasks.length).toBeGreaterThan(0);
    expect(reply.checklist!.source).toBe('ai');
  });

  it('honours an explicit task count in the prompt', () => {
    const reply = aiService.generateReply('generate a cleaning checklist with 3 tasks');
    expect(reply.checklist!.tasks).toHaveLength(3);
  });
});

describe('topic helpers', () => {
  it('offers every template plus a custom option', () => {
    const options = topicOptions();
    expect(options.some((o) => o.key === '__custom__')).toBe(true);
    expect(options.length).toBeGreaterThan(1);
  });

  it('falls back to generic tasks for an unknown topic', () => {
    const { title, tasks } = tasksForTopic('__custom__');
    expect(title).toBe('New Checklist');
    expect(tasks.length).toBeGreaterThan(0);
  });
});

describe('buildChecklist', () => {
  it('clamps the task count to the number of available tasks', () => {
    const cl = buildChecklist({
      title: 'X',
      taskTitles: ['a', 'b'],
      count: 10
    });
    expect(cl.tasks).toHaveLength(2);
  });

  it('assigns every task to the given assignee', () => {
    const cl = buildChecklist({
      title: 'X',
      taskTitles: ['a', 'b', 'c'],
      count: 3,
      assigneeId: 'u9'
    });
    expect(cl.tasks.every((t) => t.assigneeId === 'u9')).toBe(true);
  });
});
