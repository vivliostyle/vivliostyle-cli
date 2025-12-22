import { describe, expect, it } from 'vitest';
import {
  loadVivliostyleConfig,
  locateVivliostyleConfig,
} from '../src/config/load.js';
import { resolveFixture } from './command-util.js';

const NODE_JS_MAJOR_VERSION = Number(process.versions.node.split('.')[0]);

describe('TypeScript configuration files', () => {
  // TypeScript config support requires Node.js >= 22 with --experimental-strip-types
  const describeIfNodeSupportsTS =
    NODE_JS_MAJOR_VERSION >= 22 ? describe : describe.skip;

  describeIfNodeSupportsTS('locateVivliostyleConfig', () => {
    it('should locate vivliostyle.config.ts', () => {
      const configPath = locateVivliostyleConfig({
        cwd: resolveFixture('ts-config'),
      });
      expect(configPath).toMatch(/vivliostyle\.config\.ts$/);
    });

    it('should locate vivliostyle.config.mts when specified explicitly', () => {
      const configPath = locateVivliostyleConfig({
        cwd: resolveFixture('ts-config'),
        config: 'vivliostyle.config.mts',
      });
      expect(configPath).toMatch(/vivliostyle\.config\.mts$/);
    });

    it('should locate vivliostyle.config.cts when specified explicitly', () => {
      const configPath = locateVivliostyleConfig({
        cwd: resolveFixture('ts-config'),
        config: 'vivliostyle.config.cts',
      });
      expect(configPath).toMatch(/vivliostyle\.config\.cts$/);
    });
  });

  describeIfNodeSupportsTS('loadVivliostyleConfig', () => {
    it('should load vivliostyle.config.ts', async () => {
      const config = await loadVivliostyleConfig({
        cwd: resolveFixture('ts-config'),
        config: 'vivliostyle.config.ts',
      });
      expect(config?.tasks[0].title).toBe('TypeScript Config');
    });

    it('should load vivliostyle.config.mts', async () => {
      const config = await loadVivliostyleConfig({
        cwd: resolveFixture('ts-config'),
        config: 'vivliostyle.config.mts',
      });
      expect(config?.tasks[0].title).toBe('MTS Config');
    });

    // Skipped: Vite's esbuild plugin does not transpile .cts files in SSR mode.
    // See: https://github.com/vitejs/vite/issues/21322
    // This only affects the test environment (vitest); the distributed CLI
    // uses Node.js directly and .cts files work correctly there.
    // Once the Vite issue is resolved, this test can be re-enabled.
    it.skip('should load vivliostyle.config.cts', async () => {
      const config = await loadVivliostyleConfig({
        cwd: resolveFixture('ts-config'),
        config: 'vivliostyle.config.cts',
      });
      expect(config?.tasks[0].title).toBe('CTS Config');
    });
  });
});
