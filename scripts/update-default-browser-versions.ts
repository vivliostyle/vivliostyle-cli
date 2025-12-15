import {
  Browser,
  BrowserPlatform,
  BrowserTag,
  resolveBuildId,
} from '@puppeteer/browsers';
import * as fs from 'node:fs';

async function main() {
  const START_MARKER = '// START DEFAULT_BROWSER_VERSIONS';
  const END_MARKER = '// END DEFAULT_BROWSER_VERSIONS';
  const fileContent = fs.readFileSync('src/const.ts', 'utf-8');
  const startAt = fileContent.indexOf(START_MARKER);
  const endAt = fileContent.indexOf(END_MARKER);
  if (startAt === -1 || endAt === -1) {
    throw new Error('Markers not found in const.ts');
  }

  const content = `// prettier-ignore\nexport const DEFAULT_BROWSER_VERSIONS = ${await getDefaultBrowserVersions()} as const;`;
  fs.writeFileSync(
    'src/const.ts',
    `${fileContent.slice(0, startAt + START_MARKER.length)}\n${content}\n${fileContent.slice(endAt)}`,
  );
}

async function getDefaultBrowserVersions() {
  const platforms = Object.values(BrowserPlatform);
  const getVersions = async (browser: Browser, tag: BrowserTag) =>
    Object.fromEntries(
      await Promise.all(
        platforms.map(async (platform) => [
          platform,
          await resolveBuildId(browser, platform, tag),
        ]),
      ),
    );
  return `{
  chrome: ${JSON.stringify(await getVersions(Browser.CHROME, BrowserTag.STABLE))},
  chromium: ${JSON.stringify(await getVersions(Browser.CHROMIUM, BrowserTag.LATEST))},
  firefox: ${JSON.stringify(await getVersions(Browser.FIREFOX, BrowserTag.STABLE))},
}`;
}

await main();
