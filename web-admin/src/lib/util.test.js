import { describe, it, expect } from 'vitest';
import { initials, timeRange, dayKey, statusMeta } from './util.js';

describe('initials', () => {
  it('takes the first letters of up to two words', () => {
    expect(initials('Анна Иванова')).toBe('АИ');
    expect(initials('Мария')).toBe('М');
    expect(initials('Иван Петрович Сидоров')).toBe('ИП');
    expect(initials('')).toBe('');
  });
});

describe('timeRange', () => {
  it('formats start and end as HH:MM', () => {
    const start = new Date(2026, 0, 1, 8, 0);
    const end = new Date(2026, 0, 1, 16, 30);
    expect(timeRange(start.toISOString(), end.toISOString())).toBe('08:00 - 16:30');
  });
});

describe('dayKey', () => {
  it('returns the ISO date part', () => {
    expect(dayKey('2026-07-01T09:00:00.000Z')).toBe('2026-07-01');
  });
});

describe('statusMeta', () => {
  it('maps known statuses and falls back gracefully', () => {
    expect(statusMeta('active').cls).toBe('green');
    expect(statusMeta('open').label).toBe('Открыта');
    expect(statusMeta('whatever')).toEqual({ label: 'whatever', cls: 'gray' });
  });
});
