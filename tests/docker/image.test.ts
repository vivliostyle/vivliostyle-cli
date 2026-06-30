import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  GenericContainer,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  type ImageConfig,
  imageRef,
  inspectImageConfig,
  sh,
  shellContainer,
  skipUnlessReachable,
  withShell,
} from './support.js';

const NPM_REGISTRY_HOST = 'registry.npmjs.org';
// A proxy for "the browser CDN is reachable". The non-bundled browsers download
// from Google/Mozilla hosts; this is an egress check to tell a CDN outage (skip)
// from a broken image (fail), not the exact per-browser host.
const BROWSER_DOWNLOAD_HOST = 'storage.googleapis.com';
// The sidecar apt-installs its X tools and a derived image apt-repairs against
// this mirror; an outage is infra (skip), not a broken image (fail).
const DEBIAN_MIRROR_HOST = 'deb.debian.org';
const DISPLAY = ':99';
const SCREENSHOT_DIR = path.join(import.meta.dirname, 'screenshots');
const GOLDEN_DIR = path.join(
  import.meta.dirname,
  'fixtures/render-matches-golden',
);
const PRESS_READY_FIXTURE = path.join(
  import.meta.dirname,
  'fixtures/press-ready/input.pdf',
);
// A committed one-page manuscript, built by the browser and preflight checks
// (copied into the `render` container at /opt/manuscript.md).
const BUILD_MANUSCRIPT = path.join(
  import.meta.dirname,
  'fixtures/build/manuscript.md',
);

// One representative font file per Noto sub-package the image bundles. Its
// presence in `fc-list` proves that sub-package is installed and loadable -- a
// `command -v` style check would not catch a present-but-unusable font.
const NOTO_FONT_FILES: ReadonlyArray<readonly [pkg: string, file: string]> = [
  ['fonts-noto-core', 'NotoSans-Regular.ttf'],
  ['fonts-noto-cjk', 'NotoSansCJK-Regular.ttc'],
  ['fonts-noto-cjk-extra', 'NotoSansCJK-Thin.ttc'],
  ['fonts-noto-color-emoji', 'NotoColorEmoji.ttf'],
  ['fonts-noto-extra', 'NotoKufiArabic-Black.ttf'],
  ['fonts-noto-mono', 'NotoMono-Regular.ttf'],
  ['fonts-noto-ui-core', 'NotoLoopedLaoUI-Bold.ttf'],
  ['fonts-noto-ui-extra', 'NotoLoopedLaoUI-Black.ttf'],
];

const REPAIR_SCRIPT = [
  'set -e',
  'apt-get update',
  // Pull the purged dependency back by hand, past the deliberately broken dpkg
  // state, so a normal `apt-get install git` can then resolve.
  'apt-get download perl-base',
  'dpkg --install --force-depends perl-base_*.deb',
  'rm --force perl-base_*.deb',
  'apt-get install --fix-broken --yes --no-install-recommends',
  'apt-get install --yes --no-install-recommends git',
  'rm --recursive --force /var/lib/apt/lists/*',
  'cd "$(mktemp -d)"',
  'git init',
  'git -c user.email=contract@example.com -c user.name=contract commit --allow-empty -m probe',
  'git log --oneline',
].join('\n');

function buildWithBrowser(
  container: StartedTestContainer,
  browserArg: string,
): ReturnType<typeof sh> {
  const script = [
    'd=$(mktemp -d)',
    'cp /opt/manuscript.md "$d/"',
    'cd "$d"',
    `vivliostyle build manuscript.md --browser ${browserArg} -o out.pdf >/dev/null 2>&1`,
    'test -s out.pdf',
    'head -c4 out.pdf',
  ].join(' && ');
  return sh(container, script);
}

// The GUI sidecar: an Xvfb display for the X-less slim image to draw into, plus
// the tools the checks run against it -- xdpyinfo (x11-utils) for the readiness
// gate, import/convert (imagemagick) to capture and measure the screen. Signals
// SIDECAR_READY once Xvfb accepts connections, then parks.
const SIDECAR_SCRIPT = [
  'set -e',
  'apt-get update >/dev/null 2>&1',
  'apt-get install --yes --no-install-recommends xvfb x11-utils imagemagick >/dev/null 2>&1',
  `Xvfb ${DISPLAY} -screen 0 1024x768x24 -ac -nolisten tcp &`,
  'i=0',
  'while [ $i -lt 60 ]; do',
  `  if xdpyinfo -display ${DISPLAY} >/dev/null 2>&1; then break; fi`,
  '  i=$((i + 1)); sleep 1',
  'done',
  `xdpyinfo -display ${DISPLAY} >/dev/null 2>&1 || { echo SIDECAR_XVFB_FAILED; exit 1; }`,
  'echo SIDECAR_READY',
  'exec sleep infinity',
].join('\n');

// Gate the GUI check on the captured frame's unique-colour count. A not-yet-painted
// preview is one or two flat colours (the X root, or an unpainted browser -- the
// observed blank failures were 1 and 2); the painted Vivliostyle viewer is many
// hundreds. The gate is fuzzy, so keep it a minimal floor just above the blank
// cases rather than demanding a specific richness.
const RENDERED_MIN_COLORS = 5;

// Capture the sidecar's X root and count its unique colours, polling until the
// browser has painted (the capture shows content) or the deadline passes -- a
// single capture races the paint, which is why the earlier chrome/firefox shots
// came out blank while the faster-painting chromium did not. The capture doubles
// as the screenshot saved for a human to eyeball. Returns the peak colour count
// seen (0 if the capture tooling failed).
async function waitForRenderedContent(
  sidecar: StartedTestContainer,
  suffix: string,
  timeoutMs: number,
): Promise<number> {
  const shot = `/shots/preview-${suffix}.png`;
  const capture =
    `import -display ${DISPLAY} -window root ${shot} 2>/dev/null` +
    ` && convert ${shot} -format '%k' info: 2>/dev/null`;
  const deadline = Date.now() + timeoutMs;
  let peak = 0;
  while (Date.now() < deadline) {
    const { stdout } = await sidecar.exec(['sh', '-c', capture]);
    peak = Math.max(peak, Number.parseInt(stdout.trim(), 10) || 0);
    if (peak >= RENDERED_MIN_COLORS) {
      return peak;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 2000);
    });
  }
  return peak;
}

// The slim image must open a real, non-headless GUI window via `vivliostyle
// preview` and actually PAINT it -- asserting only that a window maps let a
// not-yet-painted (blank/black) window pass. With no input the CLI serves the
// Vivliostyle viewer's landing page, so there is always something to paint
// (chromium painted it with no document); the earlier blank captures were simply
// taken before chrome/firefox had finished painting, not for want of a document.
// It ships no X server and must stay as shipped (no install/repair), so a throwaway
// debian sidecar provides an Xvfb and the unmodified slim container draws to it
// over a shared network namespace.
//
// testcontainers has no PID-namespace sharing, so unlike the original shell
// contract (which leaned on `--pid container:<sidecar>` for automatic teardown)
// this manages the preview container's lifetime explicitly. The netns-sharing
// topology -- the part that actually matters -- is preserved via
// withNetworkMode('container:<id>'). Returns the peak rendered-colour count; the
// caller asserts it cleared the threshold, so the assertion is visible in the test.
async function previewRendersContent(
  browserArg: string,
  ctx: { skip: (note?: string) => void },
): Promise<number> {
  await skipUnlessReachable(ctx, DEBIAN_MIRROR_HOST);
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const sidecar = await new GenericContainer('debian:13-slim')
    .withEntrypoint(['sh', '-c', SIDECAR_SCRIPT])
    .withBindMounts([{ source: SCREENSHOT_DIR, target: '/shots', mode: 'rw' }])
    .withWaitStrategy(Wait.forLogMessage('SIDECAR_READY'))
    .withStartupTimeout(60_000)
    .start();
  try {
    const preview = await new GenericContainer(imageRef())
      // Reach Xvfb over the sidecar's netns (its abstract X socket); no volume.
      .withNetworkMode(`container:${sidecar.getId()}`)
      .withEnvironment({ DISPLAY })
      .withEntrypoint(['vivliostyle'])
      .withCommand(['preview', '--browser', browserArg])
      // It is a long-running server with no mapped ports here; just need it up.
      .withWaitStrategy(Wait.forListeningPorts())
      .start();
    try {
      const suffix = browserArg.replaceAll(/[^a-z0-9]/gv, '-');
      return await waitForRenderedContent(sidecar, suffix, 120_000);
    } finally {
      await preview.stop();
    }
  } finally {
    await sidecar.stop();
  }
}

// One parked container shared by the simple exec probes (container identity, CLI
// surface, fonts). It runs as the image's default user. Checks that mutate the
// image (apt repair), need a bind-mounted fixture (press-ready, golden), or
// download browsers (build, preview) use their own container instead.
let probe: StartedTestContainer;
beforeAll(async () => {
  probe = await shellContainer().start();
});
afterAll(async () => {
  await probe.stop();
});

// 1. container -- a correctly configured, non-root container with a writable data
// dir. Inspect-only config checks and runtime probes sit together; "declared
// config" vs "runtime behaviour" is a mechanism detail, not a separate concern.
describe('container', () => {
  let config: ImageConfig;
  beforeAll(async () => {
    config = await inspectImageConfig();
  });

  it('declares vivliostyle as the entrypoint', () => {
    expect(config.Entrypoint).toEqual(['vivliostyle']);
  });
  it('sets the working directory to /data', () => {
    expect(config.WorkingDir).toBe('/data');
  });
  it('runs as the vivliostyle user (config)', () => {
    expect(config.User).toBe('vivliostyle');
  });
  it('sets LANG=C.UTF-8', () => {
    expect(config.Env).toContain('LANG=C.UTF-8');
  });

  it('runs as a non-root user', async () => {
    // The exact uid is a build arg (USER_UID); the contract is only non-root.
    const { exitCode, stdout } = await sh(probe, 'id --user');
    expect(exitCode).toBe(0);
    expect(stdout.trim()).not.toBe('0');
  });
  it('ships the .vs-cli-version marker (isInContainer)', async () => {
    // src/util.ts isInContainer() reads this file.
    const { exitCode, stdout } = await sh(
      probe,
      'cat /opt/vivliostyle-cli/.vs-cli-version',
    );
    expect(exitCode).toBe(0);
    expect(stdout.trim()).not.toBe('');
  });
  it('lets the runtime user write to /data', async () => {
    const { exitCode } = await sh(
      probe,
      'test -d /data && touch /data/.write-probe && rm /data/.write-probe',
    );
    expect(exitCode).toBe(0);
  });
});

// 2. CLI & extensibility -- the CLI runs and users can add packages inside the
// container (the customize-processor story).
describe('CLI & extensibility', () => {
  it('exposes vs as the same CLI as vivliostyle', async () => {
    // `vs` must be vivliostyle under another name, not just some command that
    // answers --version -- so require identical, non-empty --version output.
    const vs = await sh(probe, 'vs --version');
    const vivliostyle = await sh(probe, 'vivliostyle --version');
    expect(vs.exitCode).toBe(0);
    expect(vs.stdout.trim()).not.toBe('');
    expect(vs.stdout).toBe(vivliostyle.stdout);
  });

  it('runs node (--eval)', async () => {
    const { exitCode } = await sh(
      probe,
      'node --eval "process.exit(2 + 2 === 4 ? 0 : 1)"',
    );
    expect(exitCode).toBe(0);
  });

  it('installs @vivliostyle/cli with npm and runs it', async (ctx) => {
    await skipUnlessReachable(ctx, NPM_REGISTRY_HOST);
    const { exitCode } = await sh(
      probe,
      'd=$(mktemp -d) && cd "$d"' +
        ' && npm init -y >/dev/null 2>&1' +
        ' && npm install @vivliostyle/cli >/dev/null 2>&1' +
        ' && ./node_modules/.bin/vivliostyle --version >/dev/null',
    );
    expect(exitCode).toBe(0);
  });
  it('installs @vivliostyle/cli with pnpm and runs it', async (ctx) => {
    await skipUnlessReachable(ctx, NPM_REGISTRY_HOST);
    const { exitCode } = await sh(
      probe,
      'd=$(mktemp -d) && cd "$d"' +
        ' && pnpm init >/dev/null 2>&1' +
        ' && pnpm add @vivliostyle/cli >/dev/null 2>&1' +
        ' && ./node_modules/.bin/vivliostyle --version >/dev/null',
    );
    expect(exitCode).toBe(0);
  });
});

// 3. fonts -- the renderable font assets the pipeline depends on.
describe('fonts', () => {
  let fcList: string;
  beforeAll(async () => {
    // Snapshot the catalogue once; the per-package checks are lookups into it.
    fcList = (await sh(probe, 'fc-list')).stdout;
  });

  it('resolves CJK family aliases to the bundled Noto fonts (fc-match)', async () => {
    // local.conf exists to redirect common CJK families to Noto; check the alias
    // actually resolves, not just that the file names it.
    const mincho = await sh(probe, 'fc-match "MS Mincho"');
    const gothic = await sh(probe, 'fc-match "MS Gothic"');
    expect(mincho.stdout).toContain('Noto Serif CJK JP');
    expect(gothic.stdout).toContain('Noto Sans CJK JP');
  });

  it.each(NOTO_FONT_FILES)('loads %s (%s)', (_pkg, file) => {
    expect(fcList).toContain(file);
  });
});

// 4. document production -- everything that actually generates or renders a
// document: headless builds with each browser, GUI preview with each browser,
// press-ready, and pixel-faithful output.
describe('document production', () => {
  // Builds and the press-ready preflight (which builds with the bundled chrome)
  // share one container, with the committed manuscript copied in once; the
  // non-bundled browsers download into its /opt/puppeteer.
  let render: StartedTestContainer;
  beforeAll(async () => {
    render = await shellContainer()
      .withCopyFilesToContainer([
        { source: BUILD_MANUSCRIPT, target: '/opt/manuscript.md' },
      ])
      .start();
  });
  afterAll(async () => {
    await render.stop();
  });

  describe('build renders a PDF', () => {
    // chrome is the bundled browser -> no download.
    it('with chrome', async () => {
      const { exitCode, stdout } = await buildWithBrowser(render, 'chrome');
      expect(exitCode).toBe(0);
      expect(stdout).toBe('%PDF');
    });

    // chromium, firefox and a pinned older chrome download on demand, exercising
    // the in-image @puppeteer/browsers path; they need network.
    it('with chromium', async (ctx) => {
      await skipUnlessReachable(ctx, BROWSER_DOWNLOAD_HOST);
      const { exitCode, stdout } = await buildWithBrowser(render, 'chromium');
      expect(exitCode).toBe(0);
      expect(stdout).toBe('%PDF');
    });
    it('with firefox', async (ctx) => {
      await skipUnlessReachable(ctx, BROWSER_DOWNLOAD_HOST);
      const { exitCode, stdout } = await buildWithBrowser(render, 'firefox');
      expect(exitCode).toBe(0);
      expect(stdout).toBe('%PDF');
    });
    it('with a pinned chrome (chrome@130)', async (ctx) => {
      await skipUnlessReachable(ctx, BROWSER_DOWNLOAD_HOST);
      const { exitCode, stdout } = await buildWithBrowser(render, 'chrome@130');
      expect(exitCode).toBe(0);
      expect(stdout).toBe('%PDF');
    });
  });

  describe('press-ready', () => {
    // Run press-ready on a committed fixture PDF; the contract is that it produces
    // a PDF, not just that the binary resolves. Output is silenced so the only
    // stdout is the magic.
    it('runs on a committed fixture PDF', async () => {
      const pressReady = await shellContainer()
        .withCopyFilesToContainer([
          { source: PRESS_READY_FIXTURE, target: '/data/in.pdf' },
        ])
        .start();
      try {
        const { exitCode, stdout } = await sh(
          pressReady,
          'press-ready build -i /data/in.pdf -o /data/out.pdf >/dev/null 2>&1' +
            ' && test -s /data/out.pdf && head -c4 /data/out.pdf',
        );
        expect(exitCode).toBe(0);
        expect(stdout).toBe('%PDF');
      } finally {
        await pressReady.stop();
      }
    });

    // End to end through `build`, exercising Ghostscript and poppler. `--press-ready`
    // is the documented equivalent of the config's pdfPostprocess.preflight; a
    // Ghostscript Producer in the output proves press-ready actually ran rather
    // than being skipped.
    it('preflight rewrites the PDF through Ghostscript', async () => {
      const script = [
        'd=$(mktemp -d)',
        'cp /opt/manuscript.md "$d/"',
        'cd "$d"',
        'vivliostyle build manuscript.md --press-ready -o out.pdf >/dev/null 2>&1',
        'test -s out.pdf',
        "head -c4 out.pdf | grep -q '%PDF'",
        "pdfinfo out.pdf | grep -q 'Producer:.*Ghostscript'",
      ].join(' && ');
      const { exitCode } = await sh(render, script);
      expect(exitCode).toBe(0);
    });
  });

  describe('preview opens and paints a GUI window', () => {
    it('with chrome', async (ctx) => {
      expect(await previewRendersContent('chrome', ctx)).toBeGreaterThanOrEqual(
        RENDERED_MIN_COLORS,
      );
    });
    it('with chromium', async (ctx) => {
      expect(
        await previewRendersContent('chromium', ctx),
      ).toBeGreaterThanOrEqual(RENDERED_MIN_COLORS);
    });
    it('with firefox', async (ctx) => {
      expect(
        await previewRendersContent('firefox', ctx),
      ).toBeGreaterThanOrEqual(RENDERED_MIN_COLORS);
    });
  });

  describe('render fidelity', () => {
    // Browser rendering is such a complex black box that the exact cause is,
    // frankly, unclear -- but empirically the presence/absence of fonts-liberation
    // (a Latin metric-compatible set, NOT a CJK font, declared by both Chrome's
    // deb.deps and Playwright's tools list) CERTAINLY and reproducibly shifts Noto
    // CJK rendering by a sub-pixel amount. The effect is deterministic even though
    // the cause is not understood, which is exactly what makes this byte-for-byte
    // check worthwhile: it is the sentinel that keeps fonts-liberation load-bearing.
    // fonts-liberation looks irrelevant to CJK, so the purge derivation would drop
    // it -- but doing so flips bytes here and fails, proving it must stay.
    //
    // The committed _without_liberation.png (the same build with fonts-liberation
    // purged) and _diff.png (its delta against expected.png) are the visual
    // evidence of that sub-pixel difference -- documentation, not test inputs.
    //
    // expected.png was generated as follows:
    //
    //   $ docker run --rm --volume .:/data --entrypoint sh \
    //       ghcr.io/vivliostyle/cli:11.0.2 -c '
    //         cd tests/docker/fixtures/render-matches-golden &&
    //         vivliostyle build needs-liberation.html -o /tmp/out.pdf &&
    //         pdftoppm -png -r 150 -f 1 -l 1 /tmp/out.pdf page &&
    //         mv page-1.png expected.png
    //       '
    //
    // _without_liberation.png and its diff _diff.png were generated as follows:
    //
    //   $ docker build --tag vivliostyle-cli:without-liberation - >/dev/null <<DOCKERFILE
    //   FROM ghcr.io/vivliostyle/cli:11.0.2
    //   USER root
    //   RUN dpkg --purge --force-depends fonts-liberation
    //   USER vivliostyle
    //   DOCKERFILE
    //   $ docker run --rm --volume .:/data --entrypoint sh \
    //       vivliostyle-cli:without-liberation -c '
    //         cd tests/docker/fixtures/render-matches-golden &&
    //         vivliostyle build needs-liberation.html -o /tmp/out.pdf &&
    //         pdftoppm -png -r 150 -f 1 -l 1 /tmp/out.pdf page &&
    //         mv page-1.png _without_liberation.png
    //       '
    //   $ docker run --rm --volume .:/data --workdir /data --entrypoint sh \
    //       debian:13-slim -c '
    //         apt-get update &&
    //         apt-get install --yes imagemagick &&
    //         cd tests/docker/fixtures/render-matches-golden &&
    //         compare expected.png _without_liberation.png _diff.png
    //       '
    //
    // This test asserts that no such difference arises; how stable that is against
    // future Chrome versions is, for now, unknown.
    it('renders the committed golden byte-for-byte', async () => {
      const container = await shellContainer()
        .withCopyDirectoriesToContainer([
          { source: GOLDEN_DIR, target: '/data/golden' },
        ])
        .start();
      try {
        // The fixtures land root-owned; hand them to the runtime user so `build`
        // and `pdftoppm` can write alongside them.
        await sh(container, 'chown -R vivliostyle:vivliostyle /data/golden', {
          user: 'root',
        });
        const script = [
          'cd /data/golden',
          'vivliostyle build needs-liberation.html -o out.pdf >/dev/null 2>&1',
          'pdftoppm -png -r 150 -f 1 -l 1 out.pdf actual >/dev/null 2>&1',
          'test -s actual-1.png',
          'sha256sum actual-1.png | cut -d" " -f1',
        ].join(' && ');
        const { exitCode, stdout } = await sh(container, script);
        expect(exitCode).toBe(0);

        const expectedSha = crypto
          .createHash('sha256')
          .update(fs.readFileSync(path.join(GOLDEN_DIR, 'expected.png')))
          .digest('hex');
        expect(stdout.trim()).toBe(expectedSha);
      } finally {
        await container.stop();
      }
    });
  });
});

// 5. derived-image extensibility -- the slim build leaves dpkg deliberately broken
// (install-time-only packages are force-purged), so a derived image extends it
// through a documented apt repair. git is the right probe: it is absent and
// Depends on perl, which the build purged, so installing it only succeeds if the
// repair pulls that purged dependency back in; running git then confirms the
// result is executable. This reaches the Debian mirror.
describe('derived-image extensibility', () => {
  it('repairs apt and installs a package whose purged dependency returns', async (ctx) => {
    await skipUnlessReachable(ctx, DEBIAN_MIRROR_HOST);
    await withShell(async (container) => {
      const { exitCode } = await sh(container, REPAIR_SCRIPT, { user: 'root' });
      expect(exitCode).toBe(0);
    });
  });
});
