import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import resolvePkg from 'resolve-pkg';
import path from 'upath';

export const MANIFEST_FILENAME = 'publication.json';
export const TOC_FILENAME = 'index.html';
export const TOC_TITLE = 'Table of Contents';

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

export const cliRoot = path.join(fileURLToPath(import.meta.url), '../..');
export const cliVersion = (() => {
  if (import.meta.env?.VITEST) {
    return '0.0.1';
  }
  const pkg = JSON.parse(
    fs.readFileSync(path.join(cliRoot, 'package.json'), 'utf8'),
  );
  return pkg.version;
})();

export const viewerRoot = resolvePkg('@vivliostyle/viewer', { cwd: cliRoot })!;
export const coreVersion = (() => {
  if (import.meta.env?.VITEST) {
    return '0.0.1';
  }
  const pkg = JSON.parse(
    fs.readFileSync(path.join(viewerRoot, 'package.json'), 'utf8'),
  );
  return pkg.version;
})();
