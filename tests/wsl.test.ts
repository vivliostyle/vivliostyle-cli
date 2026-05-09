import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { getWslHostIp, wslPathTransformer } from '../src/wsl.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

describe('wslNatRenderMode', () => {
  it('returns hostGateway from getWslHostIp() and pathTransformer = wslPathTransformer', async () => {
    vi.mocked(execFileSync).mockReturnValueOnce(
      'default via 172.21.112.1 dev eth0 proto kernel\n',
    );
    const { wslNatRenderMode, wslPathTransformer } = await import(
      '../src/wsl.js'
    );
    expect(wslNatRenderMode()).toEqual({
      hostGateway: '172.21.112.1',
      pathTransformer: wslPathTransformer,
    });
  });
});

describe('wslMirroredRenderMode', () => {
  it('returns hostGateway = 127.0.0.1, wslPathTransformer, and extraRunArgs = [--network=host]', async () => {
    const { wslMirroredRenderMode, wslPathTransformer } = await import(
      '../src/wsl.js'
    );
    expect(wslMirroredRenderMode()).toEqual({
      hostGateway: '127.0.0.1',
      pathTransformer: wslPathTransformer,
      extraRunArgs: ['--network=host'],
    });
  });
});

describe('wslPathTransformer', () => {
  it.each([
    ['C:\\Users\\foo', '/mnt/c/Users/foo'],
    ['C:/Users/foo', '/mnt/c/Users/foo'],
    ['d:\\bar\\baz', '/mnt/d/bar/baz'],
    ['/posix/abs', '/posix/abs'],
  ])('translates %s → %s', (input, expected) => {
    expect(wslPathTransformer(input)).toBe(expected);
  });

  it.each([
    ['relative/path'],
    ['./dot-relative'],
    [''],
    ['\\\\server\\share\\foo'],
  ])('throws on out-of-spec input %j', (input) => {
    expect(() => wslPathTransformer(input)).toThrow(
      /expected absolute path from upath\.resolve/,
    );
  });
});

describe('getWslHostIp', () => {
  it('extracts the IP from `default via X.X.X.X dev eth0`', () => {
    vi.mocked(execFileSync).mockReturnValueOnce(
      'default via 172.21.112.1 dev eth0 proto kernel\n',
    );
    expect(getWslHostIp()).toBe('172.21.112.1');
  });

  it('throws when output is unparseable', () => {
    vi.mocked(execFileSync).mockReturnValueOnce('garbage\n');
    expect(() => getWslHostIp()).toThrow(/failed to parse/);
  });
});
