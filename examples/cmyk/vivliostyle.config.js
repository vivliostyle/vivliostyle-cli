// @ts-check
import { defineConfig } from '@vivliostyle/cli';

export default defineConfig({
  entry: ['manuscript.html'],
  // cmyk: true,
  cmykWarnUnmapped: true,
});
