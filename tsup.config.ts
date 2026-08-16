import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs', 'iife'],
  globalName: 'VolterGraph',
  dts: true,
  clean: true,
  sourcemap: true,
  minify: false,
  target: 'es2020',
});
