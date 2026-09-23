import './mocks/fs.js';
import { vol } from 'memfs';
import { beforeEach, describe, expect, it } from 'vitest';

import { assertTemplateCompatibility } from '../src/scaffold.js';

const TEMPLATE_DIR = '/work/template';
const MANIFEST_PATH = `${TEMPLATE_DIR}/vivliostyle-template.json`;

const writeManifest = (content: unknown) => {
  vol.fromJSON({
    [MANIFEST_PATH]:
      typeof content === 'string' ? content : JSON.stringify(content),
  });
};

const check = (currentVersion: string) =>
  assertTemplateCompatibility({ templateDir: TEMPLATE_DIR, currentVersion });

beforeEach(() => {
  vol.reset();
});

describe('assertTemplateCompatibility', () => {
  it('skips templates without a manifest', () => {
    vol.fromJSON({ [`${TEMPLATE_DIR}/manuscript.md`]: '' });
    expect(() => check('0.0.1')).not.toThrow();
  });

  it('skips manifests without a CLI requirement', () => {
    writeManifest({});
    expect(() => check('0.0.1')).not.toThrow();

    writeManifest({ engines: { node: '>=22' } });
    expect(() => check('0.0.1')).not.toThrow();
  });

  it('accepts versions that satisfy the range', () => {
    writeManifest({ engines: { '@vivliostyle/cli': '>=11.3.0' } });
    expect(() => check('11.3.0')).not.toThrow();
    expect(() => check('12.0.0')).not.toThrow();
    expect(() => check('11.4.0-pre.1')).not.toThrow();
  });

  it('rejects versions outside the range', () => {
    writeManifest({ engines: { '@vivliostyle/cli': '>=11.3.0 <12' } });
    expect(() => check('11.2.0')).toThrow(
      'The template requires @vivliostyle/cli ">=11.3.0 <12", but the current version is 11.2.0.',
    );
    expect(() => check('12.0.0')).toThrow('but the current version is 12.0.0');
  });

  it('explains how to resolve the mismatch', () => {
    writeManifest({ engines: { '@vivliostyle/cli': '>=11.3.0' } });
    expect(() => check('11.2.0')).toThrow(
      'The template requires @vivliostyle/cli ">=11.3.0", but the current version is 11.2.0.\nUpdate @vivliostyle/cli to a version that satisfies the requirement, or use a template that supports the current version.',
    );
  });

  it('rejects a malformed manifest', () => {
    writeManifest('{ engines: ');
    expect(() => check('11.3.0')).toThrow(
      `Failed to parse the template manifest ${MANIFEST_PATH}`,
    );
  });

  it('rejects an invalid version range', () => {
    writeManifest({ engines: { '@vivliostyle/cli': 'not-a-range' } });
    expect(() => check('11.3.0')).toThrow(
      `Validation of the template manifest failed: ${MANIFEST_PATH}`,
    );
  });
});
