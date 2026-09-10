import fs from 'node:fs';

import upath from 'upath';
import * as v from 'valibot';

import {
  type ParsedVivliostyleInlineConfig,
  VivliostyleThemePackageJson,
} from '../config/schema.js';
import { THEME_CATEGORIES } from '../constants.js';
import { Logger } from '../logger.js';
import {
  cwd as defaultCwd,
  DetailError,
  pathContains,
  prettifySchemaError,
  toError,
} from '../util.js';

const THEME_PACKAGE_KEYWORD = 'vivliostyle-theme';

export interface ThemeValidationResult {
  type: 'error' | 'warning';
  message: string;
}

export async function validateTheme(
  inlineConfig: ParsedVivliostyleInlineConfig,
): Promise<ThemeValidationResult[]> {
  Logger.setLogOptions(inlineConfig);
  Logger.debug('validateTheme > inlineConfig %O', inlineConfig);

  const { cwd = defaultCwd, themePath = '.' } = inlineConfig;
  const themeDir = upath.resolve(cwd, themePath);
  const packageJsonPath = upath.join(themeDir, 'package.json');

  let rawJson: string;
  try {
    rawJson = await fs.promises.readFile(packageJsonPath, 'utf8');
  } catch (error) {
    throw new DetailError(
      `Failed to read package.json: ${packageJsonPath}`,
      toError(error).message,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new DetailError(
      `Failed to parse package.json: ${packageJsonPath}`,
      toError(error).message,
    );
  }

  const { results, packageName } = inspectThemePackage({
    parsed,
    rawJson,
    themeDir,
    packageJsonPath,
  });
  for (const result of results) {
    if (result.type === 'error') {
      Logger.logError(result.message);
    } else {
      Logger.logWarn(result.message);
    }
  }
  if (!results.some((result) => result.type === 'error')) {
    Logger.logSuccess(`The theme package is valid: ${packageName}`);
  }
  return results;
}

function inspectThemePackage({
  parsed,
  rawJson,
  themeDir,
  packageJsonPath,
}: {
  parsed: unknown;
  rawJson: string;
  themeDir: string;
  packageJsonPath: string;
}): { results: ThemeValidationResult[]; packageName?: string } {
  const parseResult = v.safeParse(VivliostyleThemePackageJson, parsed);
  if (!parseResult.success) {
    return {
      results: [
        {
          type: 'error',
          message: `Invalid package.json: ${packageJsonPath}\n${prettifySchemaError(rawJson, parseResult.issues)}`,
        },
      ],
    };
  }
  const pkg = parseResult.output;
  const results: ThemeValidationResult[] = [];

  const style = pkg.vivliostyle?.theme?.style ?? pkg.style ?? pkg.main;
  if (style) {
    const stylePath = upath.resolve(themeDir, style);
    if (!pathContains(themeDir, stylePath)) {
      results.push({
        type: 'error',
        message: `Style file must be located inside the theme package directory: ${style}`,
      });
    } else if (!fs.existsSync(stylePath) || !fs.statSync(stylePath).isFile()) {
      results.push({
        type: 'error',
        message: `Style file is not found: ${style}`,
      });
    } else if (upath.extname(stylePath).toLowerCase() !== '.css') {
      results.push({
        type: 'warning',
        message: `Style file does not have a ".css" extension: ${style}`,
      });
    }
  } else {
    results.push({
      type: 'error',
      message:
        'Missing style locator. Set one of the following fields in package.json: "vivliostyle.theme.style", "style", or "main".',
    });
  }

  const author =
    pkg.vivliostyle?.theme?.author ??
    (typeof pkg.author === 'string' ? pkg.author : pkg.author?.name);
  if (!author) {
    results.push({
      type: 'warning',
      message:
        'Missing author. Set one of the following fields in package.json: "vivliostyle.theme.author" or "author".',
    });
  }

  if (!pkg.keywords?.includes(THEME_PACKAGE_KEYWORD)) {
    results.push({
      type: 'warning',
      message: `"keywords" in package.json does not include "${THEME_PACKAGE_KEYWORD}". Add it so that the theme can be found on npm.`,
    });
  }

  const category = pkg.vivliostyle?.theme?.category;
  if (category && !THEME_CATEGORIES.some((c) => c.value === category)) {
    results.push({
      type: 'warning',
      message: `Unknown theme category "${category}". Choose one of: ${THEME_CATEGORIES.map((c) => c.value).join(', ')}.`,
    });
  }

  return { results, packageName: pkg.name };
}
