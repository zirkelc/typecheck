import { defineConfig } from 'tsdown';

export default defineConfig({
  /**
   * Run publint after bundling.
   * Requires publint to be installed.
   */
  publint: true,
  exports: true,
  entry: 'src/typecheck.ts',
  format: ['esm'],
});
