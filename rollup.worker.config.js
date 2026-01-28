import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'src/worker/bot.ts',
  output: {
    file: 'dist/worker/bot.js',
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
    '@builderbot/provider-baileys',
    'queue-promise'
  ],
  onwarn(warning, warn) {
    // Ignorar warnings de módulos externos
    if (warning.code === 'UNRESOLVED_IMPORT') return;
    warn(warning);
  }
};
