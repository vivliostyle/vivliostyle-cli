import { describe, expect, it } from 'vitest';

import { loadVivliostyleConfig } from '../src/config/load.js';
import { resolveFixture } from './command-util.js';

describe('config files importing @vivliostyle/cli without local installation', () => {
  it('falls back to the running CLI package', async () => {
    const config = await loadVivliostyleConfig({
      cwd: resolveFixture('config-import-fallback'),
    });
    expect(config?.tasks[0].title).toBe('Import Fallback');
  });
});
