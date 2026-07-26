import { build } from 'esbuild';

await build({
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'out/extension.js',
  format: 'cjs',
  external: ['vscode'],
  platform: 'node',
  sourcemap: false,
  minify: false,
  target: 'node22'
});
