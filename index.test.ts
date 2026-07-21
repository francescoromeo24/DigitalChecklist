import { describe, expect, it } from 'vitest';
import {
  checklistProgress,
  checklistStatus,
  taskFailed,
  taskStatus,
  type Checklist,
  type Task
} from './index';

function task(overrides: Partial<Task> = {}): Task {
  return { id: 't', title: 'x', completed: false, flagged: false, ...overrides };
}

function checklist(tasks: Task[], overrides: Partial<Checklist> = {}): Checklist {
  return {
    id: 'c',
    title: 'C',
    source: 'manual',
    createdBy: 'u',
    createdAt: '2020-01-01',
    updatedAt: '2020-01-01',
    tasks,
    ...overrides
  };
}

describe('checklistProgress', () => {
  it('is 0 for an empty checklist', () => {
    expect(checklistProgress(checklist([]))).toBe(0);
  });
  it('rounds the completed ratio to a percentage', () => {
    const tasks = [task({ completed: true }), task({ completed: true }), task()];
    expect(checklistProgress(checklist(tasks))).toBe(67);
  });
});

describe('taskFailed', () => {
  it('is true for an explicit fail verdict', () => {
    expect(taskFailed(task({ result: 'fail' }))).toBe(true);
  });
  it('is true for a numeric reading below min', () => {
    expect(taskFailed(task({ kind: 'number', value: 3, min: 5 }))).toBe(true);
  });
  it('is true for a numeric reading above max', () => {
    expect(taskFailed(task({ kind: 'number', value: 12, max: 10 }))).toBe(true);
  });
  it('is false for a reading within bounds', () => {
    expect(taskFailed(task({ kind: 'number', value: 7, min: 5, max: 10 }))).toBe(false);
  });
  it('is false for a passed check', () => {
    expect(taskFailed(task({ result: 'pass' }))).toBe(false);
  });
});

describe('checklistStatus', () => {
  it('is planned when untouched with no due date', () => {
    expect(checklistStatus(checklist([task()]))).toBe('planned');
  });
  it('is scheduled when untouched but has a due date', () => {
    expect(checklistStatus(checklist([task()], { dueDate: '2030-01-01' }))).toBe('scheduled');
  });
  it('is ongoing once some tasks are done', () => {
    expect(checklistStatus(checklist([task({ completed: true }), task()]))).toBe('ongoing');
  });
  it('is completed when every task is done', () => {
    expect(checklistStatus(checklist([task({ completed: true })]))).toBe('completed');
  });
});

describe('taskStatus', () => {
  const c = checklist([]);
  it('is completed for a done task', () => {
    expect(taskStatus(task({ completed: true }), c)).toBe('completed');
  });
  it('is ongoing for an assigned task', () => {
    expect(taskStatus(task({ assigneeId: 'u1' }), c)).toBe('ongoing');
  });
  it('is scheduled for an unassigned task whose checklist has a due date', () => {
    expect(taskStatus(task(), checklist([], { dueDate: '2030-01-01' }))).toBe('scheduled');
  });
  it('is planned otherwise', () => {
    expect(taskStatus(task(), c)).toBe('planned');
  });
});
