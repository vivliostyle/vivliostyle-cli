import { execFileSync } from 'node:child_process';
import { describe, expect, it, vi } from 'vitest';
import { createWslPathTransformer, getWslHostIp } from '../src/wsl.js';

vi.mock('node:child_process', () => ({ execFileSync: vi.fn() }));

describe('createDefaultWslNatRenderMode', () => {
  it('returns hostGateway from getWslHostIp() and a default-rooted path transformer', async () => {
    vi.mocked(execFileSync).mockReturnValueOnce(
      'default via 172.21.112.1 dev eth0 proto kernel\n',
    );
    const { createDefaultWslNatRenderMode } = await import('../src/wsl.js');
    const result = createDefaultWslNatRenderMode();
    expect(result.hostGateway).toBe('172.21.112.1');
    expect(result.pathTransformer('C:/Users/foo')).toBe('/mnt/c/Users/foo');
  });

  it('threads automountRoot through to the returned pathTransformer', async () => {
    vi.mocked(execFileSync).mockReturnValueOnce(
      'default via 172.21.112.1 dev eth0 proto kernel\n',
    );
    const { createDefaultWslNatRenderMode } = await import('../src/wsl.js');
    const result = createDefaultWslNatRenderMode({ automountRoot: '/' });
    expect(result.pathTransformer('C:/Users/foo')).toBe('/c/Users/foo');
  });
});

describe('createDefaultWslMirroredRenderMode', () => {
  it('returns hostGateway = 127.0.0.1, a default-rooted path transformer, and extraRunArgs = [--network=host]', async () => {
    const { createDefaultWslMirroredRenderMode } = await import(
      '../src/wsl.js'
    );
    const result = createDefaultWslMirroredRenderMode();
    expect(result.hostGateway).toBe('127.0.0.1');
    expect(result.extraRunArgs).toEqual(['--network=host']);
    expect(result.pathTransformer('C:/Users/foo')).toBe('/mnt/c/Users/foo');
  });

  it('threads automountRoot through to the returned pathTransformer', async () => {
    const { createDefaultWslMirroredRenderMode } = await import(
      '../src/wsl.js'
    );
    const result = createDefaultWslMirroredRenderMode({
      automountRoot: '/windir',
    });
    expect(result.pathTransformer('C:/Users/foo')).toBe('/windir/c/Users/foo');
  });
});

describe('createWslPathTransformer', () => {
  it.each([
    ['C:\\Users\\foo', '/mnt/c/Users/foo'],
    ['C:/Users/foo', '/mnt/c/Users/foo'],
    ['d:\\bar\\baz', '/mnt/d/bar/baz'],
    ['/posix/abs', '/posix/abs'],
  ])('default-built transformer translates %s → %s', (input, expected) => {
    expect(createWslPathTransformer()(input)).toBe(expected);
  });

  it.each([
    ['C:/Users/foo', '/', '/c/Users/foo'],
    ['C:/Users/foo', '/windir', '/windir/c/Users/foo'],
    ['C:/Users/foo', '/windir/', '/windir/c/Users/foo'],
    ['D:\\bar\\baz', '/c', '/c/d/bar/baz'],
  ])(
    'with automountRoot=%2$s, transformer translates %1$s → %3$s',
    (input, automountRoot, expected) => {
      expect(createWslPathTransformer({ automountRoot })(input)).toBe(expected);
    },
  );

  it('leaves POSIX absolute paths unchanged even when automountRoot is overridden', () => {
    const transform = createWslPathTransformer({ automountRoot: '/windir' });
    expect(transform('/posix/abs')).toBe('/posix/abs');
  });

  it.each([
    ['relative/path'],
    ['./dot-relative'],
    [''],
    ['\\\\server\\share\\foo'],
  ])('throws on out-of-spec input %j', (input) => {
    expect(() => createWslPathTransformer()(input)).toThrow(
      /createWslPathTransformer: expected absolute path from upath\.resolve/,
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
