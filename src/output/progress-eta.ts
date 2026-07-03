export type EtaEstimator = {
  update(fraction: number): void;
  estimate(): number | undefined;
};

const SMOOTHING = 0.3;

/**
 * Estimates the remaining time from the progress fraction, smoothing the
 * progress rate with an exponential moving average.
 */
export function createEtaEstimator({
  now,
}: {
  now: () => number;
}): EtaEstimator {
  let lastFraction = 0;
  let lastTime: number | undefined;
  let ratePerMs: number | undefined;

  return {
    update(fraction) {
      const time = now();
      lastTime ??= time;
      if (fraction > lastFraction) {
        const elapsed = time - lastTime;
        if (elapsed > 0) {
          const rate = (fraction - lastFraction) / elapsed;
          ratePerMs =
            ratePerMs === undefined
              ? rate
              : ratePerMs * (1 - SMOOTHING) + rate * SMOOTHING;
        }
        lastFraction = fraction;
        lastTime = time;
      }
    },
    estimate() {
      if (!ratePerMs) {
        return;
      }
      return (1 - lastFraction) / ratePerMs;
    },
  };
}

export function formatEta(ms: number): string {
  const sec = Math.ceil(ms / 1000);
  if (sec < 60) {
    return `${sec}s`;
  }
  const min = Math.ceil(sec / 60);
  if (min < 60) {
    return `${min}m`;
  }
  const hour = Math.floor(min / 60);
  const restMin = min % 60;
  return restMin ? `${hour}h${restMin}m` : `${hour}h`;
}
