import { globby } from 'globby';
import fs from 'node:fs';

const tmpFilePatterns = [
  'tests/fixtures/**/.vs-*',
  'tests/fixtures/cover/publication.json',
  'tests/fixtures/toc/publication.json',
];

export default function clean() {
  return async () => {
    const files = await globby(tmpFilePatterns, {
      onlyFiles: false,
      dot: true,
    });
    for (const file of files) {
      fs.rmSync(file, { recursive: true });
    }
  };
}
