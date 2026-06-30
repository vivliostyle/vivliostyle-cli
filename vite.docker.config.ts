import { defineConfig } from 'vitest/config';

// Docker image contract suite. These tests drive a real Docker daemon and the
// already-built Vivliostyle CLI image (named by VIVLIOSTYLE_CLI_IMAGE), so they
// are slow, require network for some checks, and are deliberately excluded from
// the default `pnpm test`. Run them with `pnpm test:docker`.
export default defineConfig({
  test: {
    include: ['tests/docker/**/*.test.ts'],
    globalSetup: ['tests/docker/global-setup.ts'],
    // Backstops for a hung test/hook, not normal-duration budgets. Most checks run
    // well under 30s; the binding case is the preview test, whose Xvfb-sidecar
    // start (<=60s) and "wait until the browser paints" poll -- which includes
    // downloading a non-bundled browser (<=120s) -- stack, so 240s clears that with
    // margin. Hooks only start a parked container (~seconds).
    testTimeout: 240_000,
    hookTimeout: 60_000,
  },
});
