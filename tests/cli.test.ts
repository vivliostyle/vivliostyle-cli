import path from 'path';
import execa from 'execa';

const packageJSON = require('../package.json');
const cliPath = path.resolve(__dirname, '..', packageJSON.bin.savepdf);

it('show version', async () => {
  const output = await execa(cliPath, ['--version']);
  expect(output.stdout).toBe(packageJSON.version);
});
