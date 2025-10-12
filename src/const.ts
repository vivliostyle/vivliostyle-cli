import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import resolvePkg from 'resolve-pkg';
import upath from 'upath';

export const MANIFEST_FILENAME = 'publication.json';
export const TOC_FILENAME = 'index.html';
export const TOC_TITLE = 'Table of Contents';
export const COVER_HTML_FILENAME = 'cover.html';
export const COVER_HTML_IMAGE_ALT = 'Cover image';

export const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';
export const EPUB_OUTPUT_VERSION = '3.0';
export const EPUB_MIMETYPE = 'application/epub+zip';
export const EPUB_NS = 'http://www.idpf.org/2007/ops';
export const EPUB_CONTAINER_XML = `${XML_DECLARATION}
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="EPUB/content.opf" media-type="application/oebps-package+xml" />
  </rootfiles>
</container>`;
export const EPUB_LANDMARKS_TITLE = 'Landmarks';
export const EPUB_LANDMARKS_TOC_ENTRY = TOC_TITLE;
export const EPUB_LANDMARKS_COVER_ENTRY = 'Cover Page';

export const EMPTY_DATA_URI = 'data:,';
export const VIEWER_ROOT_PATH = '/__vivliostyle-viewer';

export const CONTAINER_URL = 'ghcr.io/vivliostyle/cli';
export const CONTAINER_ROOT_DIR = '/data';
// Special hostname to access host machine from container
// https://docs.docker.com/desktop/features/networking/#use-cases-and-workarounds
export const CONTAINER_LOCAL_HOSTNAME = 'host.docker.internal';

export const defaultProjectFiles = {
  'package.json': /* json */ `{
  "name": "{{kebab title}}",
  "description": "{{proper title}}",
  "author": "{{author}}",
  "version": "0.0.0",
  "type": "module",
  "private": true,
  "scripts": {
    "build": "vivliostyle build",
    "preview": "vivliostyle preview"
  },
  "dependencies": {
    "@vivliostyle/cli": "{{cliVersion}}"
  }
}
`,
  'README.md': /* markdown */ `# {{proper title}}

## References

- VFM <https://vivliostyle.github.io/vfm/#/vfm>
- Vivliostyle CLI <https://github.com/vivliostyle/vivliostyle-cli#readme>
- Vivliostyle Themes <https://github.com/vivliostyle/themes#readme>
- Awesome Vivliostyle <https://github.com/vivliostyle/awesome-vivliostyle#readme>
- Vivliostyle (GitHub) <https://github.com/vivliostyle>
- Vivliostyle <https://vivliostyle.org>
`,
  '.gitignore': `node_modules/
.vivliostyle/
`,
  'vivliostyle.config.js': /* js */ `/** @type {import('@vivliostyle/cli').VivliostyleConfigSchema} */
export default {
  title: '{{proper title}}',
  author: '{{author}}',
  {{#if theme}}
  theme: '{{theme}}',
  {{/if}}
  entry: ['manuscript.md'],
};
`,
  'manuscript.md': /* markdown */ `{{lorem}}
`,
};

export const cliRoot = upath.join(fileURLToPath(import.meta.url), '../..');
export const cliVersion = (() => {
  if (import.meta.env?.VITEST) {
    return '0.0.1';
  }
  const pkg = JSON.parse(
    fs.readFileSync(upath.join(cliRoot, 'package.json'), 'utf8'),
  );
  return pkg.version;
})();

export const viewerRoot = resolvePkg('@vivliostyle/viewer', { cwd: cliRoot })!;
export const coreVersion = (() => {
  if (import.meta.env?.VITEST) {
    return '0.0.1';
  }
  const pkg = JSON.parse(
    fs.readFileSync(upath.join(viewerRoot, 'package.json'), 'utf8'),
  );
  return pkg.version;
})();
