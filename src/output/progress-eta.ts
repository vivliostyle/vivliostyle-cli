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
  const total = Math.max(0, Math.ceil(ms / 1000));
  const hh = Math.floor(total / 3600);
  const mm = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  // hh is not capped at 24h so runaway estimates stay visible (e.g. 27:14:03)
  return `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
}
