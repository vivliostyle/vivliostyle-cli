import fs from 'node:fs';
import path from 'node:path';

import {
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
    throw new Error(`${IMAGE_ENV} must name the image under test`);
  }
  return image;
})();

// Set VIVLIOSTYLE_CLI_ARTIFACT_DIR to keep test artifacts (preview screenshots
// and built PDFs) for human inspection.
const ARTIFACT_DIR_ENV = 'VIVLIOSTYLE_CLI_ARTIFACT_DIR';
const ARTIFACT_MOUNT = '/artifacts';
const KEEP_ARTIFACT_DIR = (() => {
  const dir = process.env[ARTIFACT_DIR_ENV];
  if (!dir) {
    return;
  }
  const resolved = path.resolve(dir);
  fs.mkdirSync(resolved, { recursive: true });
  // Arbitrary container uids (the uid:gid tests, the root sidecar) write here.
  fs.chmodSync(resolved, 0o777);
  return resolved;
})();

const DOCKER_FIXTURE_DIR = path.join(
  import.meta.dirname,
  'fixtures',
  'docker-image',
);

function sh(
  container: StartedTestContainer,
  script: string,
  opts?: Parameters<StartedTestContainer['exec']>[1],
): ReturnType<StartedTestContainer['exec']> {
  return container.exec(['sh', '-c', script], opts);
}

function startIdleContainer(
  opts: {
    user?: string;
    bindMounts?: Parameters<GenericContainer['withBindMounts']>[0];
  } = {},
): Promise<StartedTestContainer> {
  const READY = 'SHELL_READY';
  const container = new GenericContainer(IMAGE)
    .withEntrypoint(['sh', '-c', `echo ${READY}; exec sleep infinity`])
    .withWaitStrategy(Wait.forLogMessage(READY));
  if (opts.user) {
    container.withUser(opts.user);
  }
  // Every container gets the artifact mount, so any test can drop keepables.
  const bindMounts: Parameters<GenericContainer['withBindMounts']>[0] = [
    ...(opts.bindMounts ?? []),
  ];
  if (KEEP_ARTIFACT_DIR) {
    bindMounts.push({
      source: KEEP_ARTIFACT_DIR,
      target: ARTIFACT_MOUNT,
      mode: 'rw',
    });
  }
  if (bindMounts.length > 0) {
    container.withBindMounts(bindMounts);
  }
  return container.start();
}

async function runOneShot(
  script: string,
  opts?: Parameters<typeof sh>[2],
  containerUser?: string,
): ReturnType<typeof sh> {
  await using container = await startIdleContainer({ user: containerUser });
  return await sh(container, script, opts);
}

/**
 * Rough time budgets, sized by task weight. A test that starts no container
 * needs none of these and uses the default timeout.
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

const WRITE_MANUSCRIPT =
  "printf '%s\\n' '# Hello' '' 'Test document.' > manuscript.md";

// A trailing fragment for a build's && chain: copy the just-built out.pdf (in
// the working dir) into the artifact dir, best-effort so an unwritable mount
// never fails the build.
function keepPdf(name: string): string {
  return KEEP_ARTIFACT_DIR
    ? ` && { cp out.pdf ${ARTIFACT_MOUNT}/${name}.pdf || true; }`
    : '';
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
    async () => {
      const { exitCode, stdout } = await runOneShot('id --user');
      expect(exitCode).toBe(0);
      expect(stdout.trim()).not.toBe('0');
    },
    Timeout.LIGHT,
  );
  it(
    'ships the .vs-cli-version marker (isInContainer)',
    async () => {
      // src/util.ts isInContainer() reads this file.
      const { exitCode, stdout } = await runOneShot(
        'cat /opt/vivliostyle-cli/.vs-cli-version',
      );
      expect(exitCode).toBe(0);
      expect(stdout.trim()).not.toBe('');
    },
    Timeout.LIGHT,
  );
  it(
    'lets the runtime user write to /data',
    async () => {
      const { exitCode } = await runOneShot(
        'test -d /data && touch /data/.write-probe && rm /data/.write-probe',
      );
      expect(exitCode).toBe(0);
    },
    Timeout.LIGHT,
  );
  it(
    'ships working basic tools (cp, mv, rm)',
    async () => {
      const { exitCode, output } = await runOneShot(
        `set -e
        cd "$(mktemp -d)"
        echo probe > a.txt
        cp a.txt b.txt
        mv b.txt c.txt
        rm a.txt c.txt`,
      );
      printOnFailure(output);
      expect(exitCode).toBe(0);
    },
    Timeout.LIGHT,
  );
});

describe('Vivliostyle CLI && Node.js', () => {
  it(
    'vs reports the same non-empty --version as vivliostyle',
    async () => {
      await using container = await startIdleContainer();
      const vs = await sh(container, 'vs --version');
      const vivliostyle = await sh(container, 'vivliostyle --version');
      expect(vs.exitCode).toBe(0);
      expect(vs.stdout.trim()).not.toBe('');
      expect(vs.stdout).toBe(vivliostyle.stdout);
    },
    Timeout.LIGHT,
  );

  it(
    'runs node (--eval)',
    async () => {
      const { exitCode } = await runOneShot(
        'node --eval "process.exit(2 + 2 === 4 ? 0 : 1)"',
      );
      expect(exitCode).toBe(0);
    },
    Timeout.LIGHT,
  );

  it(
    'installs @vivliostyle/cli with npm and runs it',
    async () => {
      const { exitCode, output } = await runOneShot(
        `d=$(mktemp -d) \\
          && cd "$d" \\
          && npm init -y \\
          && npm install @vivliostyle/cli \\
          && ./node_modules/.bin/vivliostyle --version`,
      );
      printOnFailure(output);
      expect(exitCode).toBe(0);
    },
    Timeout.MEDIUM,
  );
  it(
    'installs @vivliostyle/cli with pnpm and runs it',
    async () => {
      const { exitCode, output } = await runOneShot(
        `d=$(mktemp -d) \\
          && cd "$d" \\
          && pnpm init \\
          && pnpm add @vivliostyle/cli \\
          && ./node_modules/.bin/vivliostyle --version`,
      );
      printOnFailure(output);
      expect(exitCode).toBe(0);
    },
    Timeout.MEDIUM,
  );
});

describe('document production', () => {
  function buildWithBrowser(
    browserArg: string,
    containerUser?: string,
  ): ReturnType<typeof runOneShot> {
    const name = ['build', browserArg, containerUser]
      .filter(Boolean)
      .join('-')
      .replaceAll(/[^a-z0-9]/gv, '-');
    return runOneShot(
      `d=$(mktemp -d) \\
        && cd "$d" \\
        && ${WRITE_MANUSCRIPT} \\
        && vivliostyle build manuscript.md --browser ${browserArg} -o out.pdf \\
        && test -s out.pdf${keepPdf(name)}`,
      undefined,
      containerUser,
    );
  }

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
    it(
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
      async () => {
        await using container = await startIdleContainer();
        const build = await sh(
          container,
          `mkdir /data/preflight \\
            && cd /data/preflight \\
            && ${WRITE_MANUSCRIPT} \\
            && vivliostyle build manuscript.md --press-ready -o out.pdf \\
            && test -s out.pdf${keepPdf('press-ready')}`,
        );
        printOnFailure(build.output);
        expect(build.exitCode).toBe(0);
        const probe = await sh(container, 'pdfinfo /data/preflight/out.pdf');
        printOnFailure(probe.output);
        expect(probe.exitCode).toBe(0);
        // Press-ready ran iff its Ghostscript pass rewrote the Producer.
        expect(probe.stdout).toMatch(/^Producer:.*Ghostscript/mv);
      },
      Timeout.MEDIUM,
    );
  });

  const WEBGL_MANUSCRIPT = path.join(DOCKER_FIXTURE_DIR, 'webgl.html');

  it(
    'renders canvas content drawn via WebGL into the PDF',
    async () => {
      await using container = await startIdleContainer({
        bindMounts: [
          {
            source: WEBGL_MANUSCRIPT,
            target: '/data/manuscript.html',
            mode: 'ro',
          },
        ],
      });
      const { exitCode, output, stdout } = await sh(
        container,
        `set -e
          cd "$(mktemp -d)"
          vivliostyle build /data/manuscript.html --browser chrome -o out.pdf
          test -s out.pdf${keepPdf('webgl')}
          gs -q -o - -sDEVICE=inkcov out.pdf`,
      );
      printOnFailure(output);
      expect(exitCode).toBe(0);
      const coverage = stdout.match(
        /^\s*[\d.]+\s+(?<magenta>[\d.]+)\s+(?<yellow>[\d.]+)\s+[\d.]+ CMYK/mv,
      );
      expect(coverage, `no inkcov line:\n${stdout}`).not.toBeNull();
      expect(Number(coverage?.groups?.magenta)).toBeGreaterThan(0.5);
      expect(Number(coverage?.groups?.yellow)).toBeGreaterThan(0.5);
    },
    Timeout.MEDIUM,
  );

  /**
   * Wait until the viewer window is on screen and the display's X root then
   * looks painted, or the deadline passes. Returns whether that happened.
   * Gives up as soon as `aborted` reports the preview process is gone.
   */
  async function waitForRenderedContent(
    container: StartedTestContainer,
    display: string,
    shot: string,
    minEdgeFraction: number,
    timeoutMs: number,
    aborted: () => boolean,
  ): Promise<boolean> {
    const pollInterval = 2000;
    // Under the C locale xwininfo cannot convert Firefox's UTF8_STRING title,
    // so force C.UTF-8 or the grep below never matches it.
    const capture =
      `LC_ALL=C.UTF-8 xwininfo -display ${display} -root -tree` +
      ` | grep -qi vivliostyle` +
      ` && import -display ${display} -window root ${shot}` +
      ` && convert ${shot} -scale 3% -colorspace Gray -edge 1` +
      ` -threshold 20% -format '%[fx:mean]' info:`;
    const deadline = Date.now() + timeoutMs;
    let lastCapture = '(none)';
    while (Date.now() < deadline && !aborted()) {
      const { stdout } = await sh(container, capture);
      lastCapture = stdout.trim();
      if ((Number(lastCapture) || 0) >= minEdgeFraction) {
        return true;
      }
      await new Promise((resolve) => {
        setTimeout(resolve, pollInterval);
      });
    }
    printOnFailure(
      `no painted frame within ${timeoutMs}ms; last edge fraction: ${lastCapture}`,
    );
    return false;
  }

  /**
   * `vivliostyle preview` can open a headful browser against the connected X
   * server.
   */
  async function previewRendersContent(
    browserArg: string,
    containerUser?: string,
  ): Promise<boolean> {
    const DISPLAY = ':99';
    const READY = 'SIDECAR_READY';
    const SHOTS_DIR = '/shots';
    // A structure measure that does not assume a light or dark page:
    // box-downscaling melts a flat colour or noise into a uniform field, while
    // text and page layout survive as edges. Measured on 1024x768 captures: a
    // painted viewer ~0.32, a blank display and synthetic noise ~0.
    const minEdgeFraction = 0.25;

    await using sidecar = await new GenericContainer('debian:13-slim')
      .withEntrypoint([
        'sh',
        '-c',
        `set -e
        mkdir -p ${SHOTS_DIR}
        apt-get update
        apt-get install --yes --no-install-recommends xvfb x11-utils imagemagick
        Xvfb ${DISPLAY} -screen 0 1024x768x24 -ac -nolisten tcp &
        i=0
        while [ $i -lt 60 ]; do
          if xdpyinfo -display ${DISPLAY}; then break; fi
          i=$((i + 1)); sleep 1
        done
        xdpyinfo -display ${DISPLAY} || { echo SIDECAR_XVFB_FAILED; exit 1; }
        echo ${READY}
        exec sleep infinity`,
      ])
      .withBindMounts(
        KEEP_ARTIFACT_DIR
          ? [{ source: KEEP_ARTIFACT_DIR, target: SHOTS_DIR, mode: 'rw' }]
          : [],
      )
      .withWaitStrategy(Wait.forLogMessage(READY))
      .withStartupTimeout(Timeout.LIGHT)
      .start();
    const vivliostyle = new GenericContainer(IMAGE)
      .withNetworkMode(`container:${sidecar.getId()}`)
      .withEnvironment({ DISPLAY })
      .withCommand(['preview', '--browser', browserArg])
      .withWaitStrategy(Wait.forListeningPorts());
    if (containerUser) {
      vivliostyle
        .withUser(containerUser)
        .withTmpFs({ '/data': 'rw,mode=1777' });
    }
    await using started = await vivliostyle.start();
    // The screenshot check alone cannot tell a dead preview from a slow one;
    // track the process so the verdict and the failure output include it.
    let exited = false;
    const logs: string[] = [];
    (await started.logs())
      .on('data', (chunk) => {
        logs.push(String(chunk));
      })
      .on('end', () => {
        exited = true;
      });
    const suffix = [browserArg, containerUser]
      .filter(Boolean)
      .join('-')
      .replaceAll(/[^a-z0-9]/gv, '-');
    const painted = await waitForRenderedContent(
      sidecar,
      DISPLAY,
      `${SHOTS_DIR}/preview-${suffix}.png`,
      minEdgeFraction,
      Timeout.MEDIUM,
      () => exited,
    );
    printOnFailure(
      `vivliostyle preview ${exited ? 'exited during the test' : 'kept running'};` +
        ` its output:\n${logs.join('')}`,
    );
    return painted && !exited;
  }

  describe('preview opens and paints a GUI window', () => {
    it(
      'with chrome',
      async () => {
        expect(await previewRendersContent('chrome')).toBe(true);
      },
      Timeout.HEAVY,
    );
    it(
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

  // This models the documented usage: the user runs with their own uid:gid
  // and bind-mounts a project directory they own (#835).
  describe('as a uid:gid missing from /etc/passwd', () => {
    const ARBITRARY_USER = '1234:5678';

    describe('build renders a PDF', () => {
      it(
        'with chrome',
        async () => {
          const { exitCode, output } = await buildWithBrowser(
            'chrome',
            ARBITRARY_USER,
          );
          printOnFailure(output);
          expect(exitCode).toBe(0);
        },
        Timeout.MEDIUM,
      );
      it(
        'with chromium',
        async () => {
          const { exitCode, output } = await buildWithBrowser(
            'chromium',
            ARBITRARY_USER,
          );
          printOnFailure(output);
          expect(exitCode).toBe(0);
        },
        Timeout.MEDIUM,
      );
      it(
        'with firefox',
        async () => {
          const { exitCode, output } = await buildWithBrowser(
            'firefox',
            ARBITRARY_USER,
          );
          printOnFailure(output);
          expect(exitCode).toBe(0);
        },
        Timeout.MEDIUM,
      );
      it(
        'with a pinned chrome (chrome@130)',
        async () => {
          const { exitCode, output } = await buildWithBrowser(
            'chrome@130',
            ARBITRARY_USER,
          );
          printOnFailure(output);
          expect(exitCode).toBe(0);
        },
        Timeout.MEDIUM,
      );
    });

    describe('preview opens and paints a GUI window', () => {
      it(
        'with chrome',
        async () => {
          expect(await previewRendersContent('chrome', ARBITRARY_USER)).toBe(
            true,
          );
        },
        Timeout.HEAVY,
      );
      it(
        'with chromium',
        async () => {
          expect(await previewRendersContent('chromium', ARBITRARY_USER)).toBe(
            true,
          );
        },
        Timeout.HEAVY,
      );
      it(
        'with firefox',
        async () => {
          expect(await previewRendersContent('firefox', ARBITRARY_USER)).toBe(
            true,
          );
        },
        Timeout.HEAVY,
      );
    });
  });
});

describe('mounted system fonts', () => {
  const FONT_FIXTURE_DIR = path.join(DOCKER_FIXTURE_DIR, 'system-font');
  const MANUSCRIPT = path.join(DOCKER_FIXTURE_DIR, 'system-font.html');
  const FONT_POSTSCRIPT = 'ZenOldMincho-Regular';

  const SYSTEM_FONT_DIRS = [
    '/usr/local/share/fonts',
    '/usr/share/fonts',
  ] as const;

  it.each(SYSTEM_FONT_DIRS)(
    'embeds a font mounted under %s, referenced by family name (no @font-face)',
    async (fontRoot) => {
      await using container = await startIdleContainer({
        bindMounts: [
          {
            source: FONT_FIXTURE_DIR,
            target: `${fontRoot}/mounted`,
            mode: 'ro',
          },
          {
            source: MANUSCRIPT,
            target: '/data/manuscript.html',
            mode: 'ro',
          },
        ],
      });
      const slug = fontRoot.slice(1).replaceAll('/', '-');
      const { exitCode, output, stdout } = await sh(
        container,
        `set -e
        cd "$(mktemp -d)"
        vivliostyle build /data/manuscript.html --browser chrome -o out.pdf
        test -s out.pdf
        pdffonts out.pdf${keepPdf(`system-font-${slug}`)}`,
      );
      printOnFailure(output);
      expect(exitCode).toBe(0);
      // pdffonts columns: name type encoding emb sub uni object-ID. Anchor on
      // the trailing object-ID numbers and capture the emb/sub/uni flags for
      // the row naming our font.
      const row = stdout.match(
        new RegExp(
          String.raw`\b${FONT_POSTSCRIPT}\b.*?\s(yes|no)\s+(yes|no)\s+(yes|no)\s+\d+\s+\d+\s*$`,
          'mv',
        ),
      );
      expect(
        row,
        `pdffonts did not list ${FONT_POSTSCRIPT}:\n${stdout}`,
      ).not.toBeNull();
      // Referenced by name alone, the font must be embedded, not merely named.
      expect(row?.[1]).toBe('yes');
    },
    Timeout.MEDIUM,
  );
});

describe('extensibility', () => {
  // perl-base (Essential) was purged, so /usr/bin/perl is gone and the package DB
  // is left with unmet dependencies. Restoring it through apt is circular: apt
  // refuses a broken system, and the --fix-broken repair it would run relies on
  // perl (maintainer scripts, dpkg triggers), which is exactly what is missing.
  // dpkg breaks the cycle by unpacking perl-base directly (--force-depends past
  // the unmet deps), putting the interpreter back; only then can apt --fix-broken
  // repair the remaining purged deps so the target package installs.
  it(
    'installs a package via apt and runs it',
    async () => {
      const { exitCode, output } = await runOneShot(
        `set -e
        apt-get update
        apt-get download perl-base
        dpkg --install --force-depends perl-base_*.deb
        rm --force perl-base_*.deb
        apt-get install --fix-broken --yes --no-install-recommends
        apt-get install --yes --no-install-recommends rename
        rm --recursive --force /var/lib/apt/lists/*
        cd "$(mktemp -d)"
        : > probe.txt
        rename 's/probe/renamed/' probe.txt
        test -f renamed.txt`,
        { user: 'root' },
      );
      printOnFailure(output);
      expect(exitCode).toBe(0);
    },
    Timeout.MEDIUM,
  );

  // The image build strips node-gyp; reinstalling nodejs restores it. openssl
  // must return first or apt cannot verify the NodeSource TLS certificate.
  it(
    'installs a native module with node-gyp and runs it',
    async () => {
      const { exitCode, output } = await runOneShot(
        `set -e
        apt-get update
        apt-get download perl-base
        dpkg --install --force-depends perl-base_*.deb
        rm --force perl-base_*.deb
        apt-get install --fix-broken --yes --no-install-recommends
        apt-get install --yes --no-install-recommends openssl
        apt-get update
        apt-get install --yes --no-install-recommends --reinstall nodejs
        apt-get install --yes --no-install-recommends python3 make g++
        rm --recursive --force /var/lib/apt/lists/*
        cd "$(mktemp -d)"
        npm init -y
        npm install --build-from-source bufferutil
        test -f node_modules/bufferutil/build/Release/bufferutil.node
        node --eval '
          const { mask } = require("bufferutil");
          const out = Buffer.alloc(4);
          mask(Buffer.from([1, 2, 3, 4]), Buffer.from([255, 255, 255, 255]), out, 0, 4);
          require("assert").deepStrictEqual([...out], [254, 253, 252, 251]);
        '`,
        { user: 'root' },
      );
      printOnFailure(output);
      expect(exitCode).toBe(0);
    },
    Timeout.HEAVY,
  );
});
