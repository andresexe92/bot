import typescript from 'rollup-plugin-typescript2';

export default {
  input: 'src/manager/index.ts',
  output: {
    dir: 'dist/manager',
    format: 'es',
    preserveModules: true,
    preserveModulesRoot: 'src/manager'
  },
  plugins: [
    typescript({
      tsconfig: './tsconfig.json',
      tsconfigOverride: {
        compilerOptions: {
          outDir: 'dist/manager',
          declaration: false
        }
      }
    })
  ],
  external: [
    'child_process',
    'fs',
    'path',
    'express',
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
