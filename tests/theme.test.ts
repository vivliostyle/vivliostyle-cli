import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type MockTree = {
  children: Map<string, { version?: string }>;
};

const mockedArborist = vi.hoisted(() => ({
  loadActual: vi.fn<() => Promise<MockTree>>(),
}));

vi.mock('@npmcli/arborist', () => ({
  default: class Arborist {
    loadActual = mockedArborist.loadActual;
  },
}));

import type { ParsedTheme } from '../src/config/resolve.js';
import { checkThemeInstallationNecessity } from '../src/processor/theme.js';

const packageTheme = (name: string, specifier: string): ParsedTheme => ({
  type: 'package',
  name,
  specifier,
  location: `/themes/node_modules/${name}`,
  registry: true,
});

describe('checkThemeInstallationNecessity', () => {
  let themesDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    themesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vivliostyle-theme-'));
  });

  afterEach(() => {
    fs.rmSync(themesDir, { recursive: true, force: true });
  });

  it('requires installation for missing packages', async () => {
    mockedArborist.loadActual.mockResolvedValue({ children: new Map() });
    await expect(
      checkThemeInstallationNecessity({
        themesDir,
        themeIndexes: new Set([packageTheme('pkg', 'pkg')]),
      }),
    ).resolves.toBe(true);
  });

  it('skips installation when the installed version satisfies the range', async () => {
    mockedArborist.loadActual.mockResolvedValue({
      children: new Map([['pkg', { version: '3.2.0' }]]),
    });
    await expect(
      checkThemeInstallationNecessity({
        themesDir,
        themeIndexes: new Set([packageTheme('pkg', 'pkg@^3.0.0')]),
      }),
    ).resolves.toBe(false);
  });

  it('requires installation when the installed version does not satisfy the range', async () => {
    mockedArborist.loadActual.mockResolvedValue({
      children: new Map([['pkg', { version: '2.0.0' }]]),
    });
    await expect(
      checkThemeInstallationNecessity({
        themesDir,
        themeIndexes: new Set([packageTheme('pkg', 'pkg@^3.0.0')]),
      }),
    ).resolves.toBe(true);
  });

  it('does not verify the version of dist-tag specifiers', async () => {
    mockedArborist.loadActual.mockResolvedValue({
      children: new Map([['pkg', { version: '0.1.0' }]]),
    });
    await expect(
      checkThemeInstallationNecessity({
        themesDir,
        themeIndexes: new Set([packageTheme('pkg', 'pkg@latest')]),
      }),
    ).resolves.toBe(false);
  });
});
