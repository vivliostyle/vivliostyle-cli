import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

import {
  type ExecOptions,
  type ExecResult,
  GenericContainer,
  getContainerRuntimeClient,
  ImageName,
  type StartedTestContainer,
  Wait,
} from 'testcontainers';
import { describe, expect, it, onTestFailed } from 'vitest';

const IMAGE_ENV = 'VIVLIOSTYLE_CLI_IMAGE';
const IMAGE = (() => {
  const image = process.env[IMAGE_ENV];
  if (!image) {
    throw new Error(
      `${IMAGE_ENV} must name the image under test, e.g.\n` +
        `  ${IMAGE_ENV}=localhost:5000/vivliostyle/cli:latest pnpm test:docker`,
    );
  }
  return image;
})();

function sh(
  container: StartedTestContainer,
  script: string,
  opts?: Partial<ExecOptions>,
): Promise<ExecResult> {
  return container.exec(['sh', '-c', script], opts);
}

type Run<T> = (container: StartedTestContainer) => Promise<T>;
type Configure = (builder: GenericContainer) => GenericContainer;

async function withContainer<T>(
  builder: GenericContainer,
  fn: Run<T>,
): Promise<T> {
  const container = await builder.start();
  try {
    return await fn(container);
  } finally {
    await container.stop();
  }
}

function withShell<T>(fn: Run<T>): Promise<T>;
function withShell<T>(configure: Configure, fn: Run<T>): Promise<T>;
function withShell<T>(
  configureOrFn: Configure | Run<T>,
  fn?: Run<T>,
): Promise<T> {
  const configure: Configure = fn
    ? (configureOrFn as Configure)
    : (builder) => builder;
  const run: Run<T> = fn ?? (configureOrFn as Run<T>);
  const READY = 'SHELL_READY';
  return withContainer(
    configure(
      new GenericContainer(IMAGE)
        .withEntrypoint(['sh', '-c', `echo ${READY}; exec sleep infinity`])
        .withWaitStrategy(Wait.forLogMessage(READY)),
    ),
    run,
  );
}

/**
 * Rough per-test time budgets, sized by task weight. A task that starts no
 * container needs none of these and uses the default timeout.
 */
const Timeout = {
  LIGHT: 60_000,
  MEDIUM: 120_000,
  HEAVY: 240_000,
} as const;

function printOnFailure(output: string): void {
  onTestFailed(() => {
    console.error(output);
  });
}

const BUILD_MANUSCRIPT = path.join(
  import.meta.dirname,
  'fixtures/docker-image/build/manuscript.md',
);

function buildWithBrowser(browserArg: string): Promise<ExecResult> {
  return withShell(
    (builder) =>
      builder.withCopyFilesToContainer([
        { source: BUILD_MANUSCRIPT, target: '/tmp/manuscript.md' },
      ]),
    (container) =>
      sh(
        container,
        [
          'd=$(mktemp -d)',
          'cp /tmp/manuscript.md "$d/"',
          'cd "$d"',
          `vivliostyle build manuscript.md --browser ${browserArg} -o out.pdf`,
          'test -s out.pdf',
        ].join(' && '),
      ),
  );
}

// Poll the sidecar's X root until the browser has painted (a single capture races
// the paint) or the deadline passes; the capture doubles as a screenshot for a
// human. Returns whether the preview painted.
async function waitForRenderedContent(
  sidecar: StartedTestContainer,
  display: string,
  suffix: string,
  timeoutMs: number,
): Promise<boolean> {
  // A preview that has not painted (still loading or failed) is a single colour or
  // very few; a painted Vivliostyle viewer has many hundreds. Treat a count above
  // this low floor as painted.
  const minColors = 5;
  const pollInterval = 2000;
  const shot = `/shots/preview-${suffix}.png`;
  const capture =
    `import -display ${display} -window root ${shot}` +
    ` && convert ${shot} -format '%k' info:`;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { stdout } = await sh(sidecar, capture);
    if ((Number.parseInt(stdout.trim(), 10) || 0) >= minColors) {
      return true;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, pollInterval);
    });
  }
  return false;
}

// `preview` must open a real, non-headless GUI window and actually PAINT it (with
// no input the CLI serves the viewer's landing page, so there is always something
// to paint). The image has no X server, so a throwaway debian sidecar provides an
// Xvfb and the container draws to it over a shared network namespace.
function previewRendersContent(browserArg: string): Promise<boolean> {
  const DISPLAY = ':99';
  const READY = 'SIDECAR_READY';
  const sidecarStartupTimeout = 60_000;
  const paintDeadline = 120_000;
  const screenshotDir = path.join(
    import.meta.dirname,
    'docker-image-screenshots',
  );
  fs.mkdirSync(screenshotDir, { recursive: true });

  const sidecar = new GenericContainer('debian:13-slim')
    .withEntrypoint([
      'sh',
      '-c',
      [
        'set -e',
        'apt-get update',
        'apt-get install --yes --no-install-recommends xvfb x11-utils imagemagick',
        `Xvfb ${DISPLAY} -screen 0 1024x768x24 -ac -nolisten tcp &`,
        'i=0',
        'while [ $i -lt 60 ]; do',
        `  if xdpyinfo -display ${DISPLAY}; then break; fi`,
        '  i=$((i + 1)); sleep 1',
        'done',
        `xdpyinfo -display ${DISPLAY} || { echo SIDECAR_XVFB_FAILED; exit 1; }`,
        `echo ${READY}`,
        'exec sleep infinity',
      ].join('\n'),
    ])
    .withBindMounts([{ source: screenshotDir, target: '/shots', mode: 'rw' }])
    .withWaitStrategy(Wait.forLogMessage(READY))
    .withStartupTimeout(sidecarStartupTimeout);
  return withContainer(sidecar, (started) =>
    withContainer(
      new GenericContainer(IMAGE)
        .withNetworkMode(`container:${started.getId()}`)
        .withEnvironment({ DISPLAY })
        .withEntrypoint(['vivliostyle'])
        .withCommand(['preview', '--browser', browserArg])
        .withWaitStrategy(Wait.forListeningPorts()),
      () => {
        const suffix = browserArg.replaceAll(/[^a-z0-9]/gv, '-');
        return waitForRenderedContent(started, DISPLAY, suffix, paintDeadline);
      },
    ),
  );
}

describe('container', () => {
  it('declares the expected entrypoint, workdir, user and locale', async () => {
    const client = await getContainerRuntimeClient();
    const { Config } = await client.image.inspect(ImageName.fromString(IMAGE));
    expect(Config.Entrypoint).toEqual(['vivliostyle']);
    expect(Config.WorkingDir).toBe('/data');
    expect(Config.User).toBe('vivliostyle');
    expect(Config.Env).toContain('LANG=C.UTF-8');
  });

  it(
    'runs as a non-root user',
    () =>
      withShell(async (container) => {
        const { exitCode, stdout } = await sh(container, 'id --user');
        expect(exitCode).toBe(0);
        expect(stdout.trim()).not.toBe('0');
      }),
    Timeout.LIGHT,
  );
  it(
    'ships the .vs-cli-version marker (isInContainer)',
    () =>
      withShell(async (container) => {
        // src/util.ts isInContainer() reads this file.
        const { exitCode, stdout } = await sh(
          container,
          'cat /opt/vivliostyle-cli/.vs-cli-version',
        );
        expect(exitCode).toBe(0);
        expect(stdout.trim()).not.toBe('');
      }),
    Timeout.LIGHT,
  );
  it(
    'lets the runtime user write to /data',
    () =>
      withShell(async (container) => {
        const { exitCode } = await sh(
          container,
          'test -d /data && touch /data/.write-probe && rm /data/.write-probe',
        );
        expect(exitCode).toBe(0);
      }),
    Timeout.LIGHT,
  );
});

describe('CLI & extensibility', () => {
  it(
    'vs reports the same non-empty --version as vivliostyle',
    () =>
      withShell(async (container) => {
        const vs = await sh(container, 'vs --version');
        const vivliostyle = await sh(container, 'vivliostyle --version');
        expect(vs.exitCode).toBe(0);
        expect(vs.stdout.trim()).not.toBe('');
        expect(vs.stdout).toBe(vivliostyle.stdout);
      }),
    Timeout.LIGHT,
  );

  it(
    'runs node (--eval)',
    () =>
      withShell(async (container) => {
        const { exitCode } = await sh(
          container,
          'node --eval "process.exit(2 + 2 === 4 ? 0 : 1)"',
        );
        expect(exitCode).toBe(0);
      }),
    Timeout.LIGHT,
  );

  it(
    'installs @vivliostyle/cli with npm and runs it',
    () =>
      withShell(async (container) => {
        const { exitCode, output } = await sh(
          container,
          [
            'd=$(mktemp -d)',
            'cd "$d"',
            'npm init -y',
            'npm install @vivliostyle/cli',
            './node_modules/.bin/vivliostyle --version',
          ].join(' && '),
        );
        printOnFailure(output);
        expect(exitCode).toBe(0);
      }),
    Timeout.MEDIUM,
  );
  it(
    'installs @vivliostyle/cli with pnpm and runs it',
    () =>
      withShell(async (container) => {
        const { exitCode, output } = await sh(
          container,
          [
            'd=$(mktemp -d)',
            'cd "$d"',
            'pnpm init',
            'pnpm add @vivliostyle/cli',
            './node_modules/.bin/vivliostyle --version',
          ].join(' && '),
        );
        printOnFailure(output);
        expect(exitCode).toBe(0);
      }),
    Timeout.MEDIUM,
  );
});

describe('fonts', () => {
  it(
    'resolves CJK family aliases to the bundled Noto fonts (fc-match)',
    () =>
      withShell(async (container) => {
        const mincho = await sh(container, 'fc-match "MS Mincho"');
        const gothic = await sh(container, 'fc-match "MS Gothic"');
        expect(mincho.stdout).toContain('Noto Serif CJK JP');
        expect(gothic.stdout).toContain('Noto Sans CJK JP');
      }),
    Timeout.LIGHT,
  );

  it(
    'bundles a loadable file from each Noto sub-package',
    () =>
      withShell(async (container) => {
        const representativeFonts: ReadonlyArray<
          readonly [pkg: string, file: string]
        > = [
          ['fonts-noto-core', 'NotoSans-Regular.ttf'],
          ['fonts-noto-cjk', 'NotoSansCJK-Regular.ttc'],
          ['fonts-noto-cjk-extra', 'NotoSansCJK-Thin.ttc'],
          ['fonts-noto-color-emoji', 'NotoColorEmoji.ttf'],
          ['fonts-noto-extra', 'NotoKufiArabic-Black.ttf'],
          ['fonts-noto-mono', 'NotoMono-Regular.ttf'],
          ['fonts-noto-ui-core', 'NotoLoopedLaoUI-Bold.ttf'],
          ['fonts-noto-ui-extra', 'NotoLoopedLaoUI-Black.ttf'],
        ];
        const fcList = (await sh(container, 'fc-list')).stdout;
        for (const [, file] of representativeFonts) {
          expect(fcList).toContain(file);
        }
      }),
    Timeout.LIGHT,
  );
});

describe('document production', () => {
  describe('build renders a PDF', () => {
    it(
      'with chrome',
      async () => {
        const { exitCode, output } = await buildWithBrowser('chrome');
        printOnFailure(output);
        expect(exitCode).toBe(0);
      },
      Timeout.MEDIUM,
    );
    // see https://issues.chromium.org/issues/529102889
    // eslint-disable-next-line vitest/no-disabled-tests
    it.skip(
      'with chromium',
      async () => {
        const { exitCode, output } = await buildWithBrowser('chromium');
        printOnFailure(output);
        expect(exitCode).toBe(0);
      },
      Timeout.MEDIUM,
    );
    it(
      'with firefox',
      async () => {
        const { exitCode, output } = await buildWithBrowser('firefox');
        printOnFailure(output);
        expect(exitCode).toBe(0);
      },
      Timeout.MEDIUM,
    );
    it(
      'with a pinned chrome (chrome@130)',
      async () => {
        const { exitCode, output } = await buildWithBrowser('chrome@130');
        printOnFailure(output);
        expect(exitCode).toBe(0);
      },
      Timeout.MEDIUM,
    );
  });

  describe('press-ready', () => {
    it(
      'preflight rewrites the PDF through Ghostscript',
      () =>
        withShell(
          (builder) =>
            builder.withCopyFilesToContainer([
              { source: BUILD_MANUSCRIPT, target: '/tmp/manuscript.md' },
            ]),
          async (container) => {
            const build = await sh(
              container,
              [
                'mkdir /data/preflight',
                'cp /tmp/manuscript.md /data/preflight/',
                'cd /data/preflight',
                'vivliostyle build manuscript.md --press-ready -o out.pdf',
                'test -s out.pdf',
              ].join(' && '),
            );
            printOnFailure(build.output);
            expect(build.exitCode).toBe(0);
            const probe = await sh(
              container,
              'pdfinfo /data/preflight/out.pdf',
            );
            printOnFailure(probe.output);
            expect(probe.exitCode).toBe(0);
            // Press-ready ran iff its Ghostscript pass rewrote the Producer.
            expect(probe.stdout).toMatch(/^Producer:.*Ghostscript/mv);
          },
        ),
      Timeout.MEDIUM,
    );
  });

  describe('preview opens and paints a GUI window', () => {
    it(
      'with chrome',
      async () => {
        expect(await previewRendersContent('chrome')).toBe(true);
      },
      Timeout.HEAVY,
    );
    // see https://issues.chromium.org/issues/529102889
    // eslint-disable-next-line vitest/no-disabled-tests
    it.skip(
      'with chromium',
      async () => {
        expect(await previewRendersContent('chromium')).toBe(true);
      },
      Timeout.HEAVY,
    );
    it(
      'with firefox',
      async () => {
        expect(await previewRendersContent('firefox')).toBe(true);
      },
      Timeout.HEAVY,
    );
  });

  describe('render fidelity', () => {
    // Browser rendering is a complex black box, but empirically the presence or
    // absence of fonts-liberation (a Latin metric-compatible set, NOT a CJK font,
    // declared by both Chrome's deb.deps and Playwright's tools list) reproducibly
    // shifts Noto CJK rendering by a sub-pixel amount. The effect is deterministic
    // even though the cause is not understood, which is what makes this byte-for-byte
    // check worthwhile: fonts-liberation looks irrelevant to CJK and so is an easy
    // thing to drop from an image, but doing so flips bytes here and fails.
    //
    // The committed _without_liberation.png (the same build with fonts-liberation
    // purged) and _diff.png (its delta against expected.png) are the visual evidence
    // of that sub-pixel difference: documentation, not test inputs.
    //
    // expected.png was generated as follows:
    //
    //   $ docker run --rm --volume .:/data --entrypoint sh \
    //       ghcr.io/vivliostyle/cli:11.0.2 -c '
    //         cd tests/fixtures/docker-image/render-matches-golden &&
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
    //         cd tests/fixtures/docker-image/render-matches-golden &&
    //         vivliostyle build needs-liberation.html -o /tmp/out.pdf &&
    //         pdftoppm -png -r 150 -f 1 -l 1 /tmp/out.pdf page &&
    //         mv page-1.png _without_liberation.png
    //       '
    //   $ docker run --rm --volume .:/data --workdir /data --entrypoint sh \
    //       debian:13-slim -c '
    //         apt-get update &&
    //         apt-get install --yes imagemagick &&
    //         cd tests/fixtures/docker-image/render-matches-golden &&
    //         compare expected.png _without_liberation.png _diff.png
    //       '
    //
    // This test asserts that no such difference arises; how stable that is against
    // future Chrome versions is, for now, unknown.
    it(
      'renders the committed golden byte-for-byte',
      () => {
        const goldenDir = path.join(
          import.meta.dirname,
          'fixtures/docker-image/render-matches-golden',
        );
        return withShell(
          (builder) =>
            builder.withCopyDirectoriesToContainer([
              { source: goldenDir, target: '/data/golden' },
            ]),
          async (container) => {
            // The fixtures land root-owned; hand them to the runtime user so `build`
            // and `pdftoppm` can write alongside them.
            await sh(
              container,
              'chown -R vivliostyle:vivliostyle /data/golden',
              {
                user: 'root',
              },
            );
            const rendered = await sh(
              container,
              [
                'cd /data/golden',
                'vivliostyle build needs-liberation.html -o out.pdf',
                'pdftoppm -png -r 150 -f 1 -l 1 out.pdf actual',
                'test -s actual-1.png',
              ].join(' && '),
            );
            printOnFailure(rendered.output);
            expect(rendered.exitCode).toBe(0);

            const sha = await sh(
              container,
              'sha256sum /data/golden/actual-1.png',
            );
            printOnFailure(sha.output);
            expect(sha.exitCode).toBe(0);
            const actualSha = sha.stdout.trim().split(' ')[0];

            const expectedSha = crypto
              .createHash('sha256')
              .update(fs.readFileSync(path.join(goldenDir, 'expected.png')))
              .digest('hex');
            expect(actualSha).toBe(expectedSha);
          },
        );
      },
      Timeout.MEDIUM,
    );
  });
});

describe('extensibility', () => {
  // A derived image can apt-install a package the base lacks and run it. git is the
  // probe: absent, and it Depends on perl, so installing it first needs the dpkg
  // repair (the perl-base step).
  it(
    'installs git via apt and runs it',
    () =>
      withShell(async (container) => {
        const { exitCode, output } = await sh(
          container,
          [
            'set -e',
            'apt-get update',
            // Reinstall perl-base by hand and --fix-broken first, so the git install
            // resolves even on an image whose dpkg was left deliberately broken.
            'apt-get download perl-base',
            'dpkg --install --force-depends perl-base_*.deb',
            'rm --force perl-base_*.deb',
            'apt-get install --fix-broken --yes --no-install-recommends',
            'apt-get install --yes --no-install-recommends git',
            'rm --recursive --force /var/lib/apt/lists/*',
            'cd "$(mktemp -d)"',
            'git init',
            'git -c user.email=probe@example.com -c user.name=probe commit --allow-empty -m probe',
            'git log --oneline',
          ].join('\n'),
          { user: 'root' },
        );
        printOnFailure(output);
        expect(exitCode).toBe(0);
      }),
    Timeout.MEDIUM,
  );
});
