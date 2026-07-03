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
  it('shows seconds under a minute', () => {
    expect(formatEta(1000)).toBe('1s');
    expect(formatEta(34000)).toBe('34s');
  });

  it('rounds up to minutes under an hour', () => {
    expect(formatEta(59999)).toBe('1m');
    expect(formatEta(61000)).toBe('2m');
    expect(formatEta(600000)).toBe('10m');
  });

  it('formats hours with the remaining minutes', () => {
    expect(formatEta(3600000)).toBe('1h');
    expect(formatEta(3900000)).toBe('1h5m');
  });
});
