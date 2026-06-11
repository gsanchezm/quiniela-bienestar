import { describe, it, expect } from 'vitest';
import { canSeePick } from './privacy';

const kickoff = new Date('2026-06-11T19:00:00Z');
const antes = new Date('2026-06-11T18:00:00Z');
const después = new Date('2026-06-11T19:30:00Z');

describe('privacidad de picks', () => {
  it('el dueño siempre ve sus propios picks', () => {
    expect(canSeePick('u1', 'u1', kickoff, antes)).toBe(true);
    expect(canSeePick('u1', 'u1', kickoff, después)).toBe(true);
  });

  it('los picks ajenos se ocultan hasta el kickoff', () => {
    expect(canSeePick('u2', 'u1', kickoff, antes)).toBe(false);
  });

  it('los picks ajenos se revelan desde el kickoff', () => {
    expect(canSeePick('u2', 'u1', kickoff, kickoff)).toBe(true);
    expect(canSeePick('u2', 'u1', kickoff, después)).toBe(true);
  });
});
