import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'src/worker/bot-meta.ts',
  output: {
    file: 'dist/worker/bot-meta.js',
    format: 'es'
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      tsconfigOverride: {
        compilerOptions: {
          outDir: 'dist/worker',
          declaration: false
        }
      }
    })
  ],
  external: [
    'fs',
    'path',
    '@builderbot/bot',
    '@builderbot/provider-meta',
    'queue-promise',
    'dotenv'
  ],
  onwarn(warning, warn) {
    if (warning.code === 'UNRESOLVED_IMPORT') return;
    warn(warning);
  }
};
