import { describe, expect, it } from 'vitest';

import {
  buildPickerUrl,
  parseCallback,
  pickThemeInBrowser,
} from '../src/theme-picker.js';

const STATE = 'abcdefghijklmnopqrstuv';

describe('buildPickerUrl', () => {
  it('builds the entry URL of the selection mode', () => {
    expect(
      buildPickerUrl({
        siteUrl: 'https://theme.vivliostyle.org',
        locale: 'ja-JP',
        port: 51234,
        state: STATE,
        allowTemplate: true,
        communityOnly: false,
      }),
    ).toBe(
      `https://theme.vivliostyle.org/ja/select?client=cli&port=51234&state=${STATE}&v=1&allowTemplate=1`,
    );
    expect(
      buildPickerUrl({
        siteUrl: 'https://theme.vivliostyle.org',
        locale: 'fr',
        port: 1,
        state: STATE,
        allowTemplate: false,
        communityOnly: true,
      }),
    ).toBe(
      `https://theme.vivliostyle.org/en/select?client=cli&port=1&state=${STATE}&v=1&source=community`,
    );
  });
});

describe('parseCallback', () => {
  const parse = (query: string) =>
    parseCallback(new URLSearchParams(query), STATE);

  it('accepts a valid choice', () => {
    expect(
      parse(
        `state=${STATE}&theme=%40scope%2Ftheme&version=1.2.3&template=default`,
      ),
    ).toEqual({
      name: '@scope/theme',
      version: '1.2.3',
      templateId: 'default',
    });
  });

  it.each([
    `state=${'x'.repeat(22)}&theme=theme&version=1.0.0`,
    `state=${STATE}x&theme=theme&version=1.0.0`,
    `state=${STATE}&theme=Bad%20Name&version=1.0.0`,
    `state=${STATE}&theme=theme&version=latest`,
    `state=${STATE}&theme=theme&version=1.0.0&template=`,
  ])('rejects %s', (query) => {
    expect(parse(query)).toBeUndefined();
  });
});

describe('pickThemeInBrowser', () => {
  it('resolves with the choice sent to the loopback server', async () => {
    let shownUrl = '';
    const result = await pickThemeInBrowser({
      siteUrl: 'https://theme.example',
      locale: 'en',
      allowTemplate: false,
      communityOnly: false,
      onUrl: (url) => {
        shownUrl = url;
      },
      open: async (url) => {
        const page = new URL(url);
        const response = await fetch(
          `http://127.0.0.1:${page.searchParams.get('port')}/callback?state=${page.searchParams.get('state')}&theme=theme&version=1.0.0`,
        );
        expect(response.headers.get('content-security-policy')).toBe(
          "default-src 'none'",
        );
      },
    });
    expect(shownUrl).toMatch(/^https:\/\/theme\.example\/en\/select\?/v);
    expect(result).toEqual({
      type: 'selected',
      selection: { name: 'theme', version: '1.0.0' },
    });
  });

  it('times out', async () => {
    const result = await pickThemeInBrowser({
      siteUrl: 'https://theme.example',
      locale: 'en',
      allowTemplate: false,
      communityOnly: false,
      onUrl: () => {},
      open: () => Promise.resolve(),
      timeoutMs: 10,
    });
    expect(result).toEqual({ type: 'timeout' });
  });
});
