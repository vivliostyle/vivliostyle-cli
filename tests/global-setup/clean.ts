import fs from 'node:fs';
import { glob } from 'tinyglobby';

const tmpFilePatterns = [
  'tests/fixtures/**/.vs-*',
  'tests/fixtures/**/.vite',
  'tests/fixtures/config/**/vvv.*',
  'tests/fixtures/cover/publication.json',
  'tests/fixtures/toc/publication.json',
];

export default function clean() {
  return async () => {
    const files = await glob(tmpFilePatterns, {
      onlyFiles: false,
      dot: true,
    });
    for (const file of files) {
      if (fs.existsSync(file)) {
        fs.rmSync(file, { recursive: true });
      }
    }
  };
}
