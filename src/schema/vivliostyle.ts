import fs from 'node:fs';
import path from 'upath';
import { cliRoot } from '../const.js';

// TODO: Change to static import after JSON module becomes stable
const importJSON = (p: string) =>
  JSON.parse(fs.readFileSync(path.join(cliRoot, p), 'utf8'));

const vivliostyleConfigSchema = importJSON(
  'schemas/vivliostyle/vivliostyleConfig.schema.json',
);

export { vivliostyleConfigSchema };
