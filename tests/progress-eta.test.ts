import { describe, expect, it } from 'vitest';

import { createEtaEstimator, formatEta } from '../src/output/progress-eta.js';

function createClock(start = 0) {
  let time = start;
  return {
    now: () => time,
    advance: (ms: number) => {
      time += ms;
    },
  };
}

describe('createEtaEstimator', () => {
  it('returns an estimate from the second advancing update', () => {
    const clock = createClock();
    const eta = createEtaEstimator({ now: clock.now });
    eta.update(0.1);
    expect(eta.estimate()).toBeUndefined();
    clock.advance(1000);
    eta.update(0.2);
    // 80% remains at 10% per second
    expect(eta.estimate()).toBeCloseTo(8000, 0);
  });

  it('estimates the remaining time from the progress rate', () => {
    const clock = createClock();
    const eta = createEtaEstimator({ now: clock.now });
    eta.update(0);
    // Advances 10% per second at a constant rate
    for (let i = 1; i <= 5; i++) {
      clock.advance(1000);
      eta.update(i / 10);
    }
    // 50% remains at 10% per second
    expect(eta.estimate()).toBeCloseTo(5000, 0);
  });
});

describe('formatEta', () => {
  it('shows a zero-padded hh:mm:ss under a minute', () => {
    expect(formatEta(1000)).toBe('00:00:01');
    expect(formatEta(34000)).toBe('00:00:34');
  });

  it('rounds up to whole seconds and carries into minutes', () => {
    expect(formatEta(59999)).toBe('00:01:00');
    expect(formatEta(61000)).toBe('00:01:01');
    expect(formatEta(600000)).toBe('00:10:00');
  });

  it('never caps the hours field at 24h', () => {
    expect(formatEta(3600000)).toBe('01:00:00');
    expect(formatEta(3900000)).toBe('01:05:00');
    expect(formatEta(90061000)).toBe('25:01:01');
  });
});
