import { commonjs } from '@hyrious/esbuild-plugin-commonjs';
import chokidar from 'chokidar';
import { context } from 'esbuild';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dirname = path.dirname(fileURLToPath(import.meta.url));

const ctx = await context({
  entryPoints: [path.join(dirname, 'index.src.js')],
  bundle: true,
  format: 'esm',
  outfile: path.join(dirname, 'index.js'),
  platform: 'node',
  plugins: [commonjs()],
}).catch(() => process.exit(1));
await ctx.rebuild();

if (process.argv.slice(2).includes('-w')) {
  chokidar.watch(path.join(dirname, '**')).on('all', async () => {
    await ctx.rebuild().catch(() => {
      /* NOOP */
    });
  });
} else {
  await ctx.dispose();
}
