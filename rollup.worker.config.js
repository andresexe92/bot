import typescript from 'rollup-plugin-typescript2';

const commonPlugins = [
  typescript({
    tsconfig: './tsconfig.json',
    tsconfigOverride: {
      compilerOptions: {
        outDir: 'dist/worker',
        declaration: false
      }
    }
  })
];

const onwarn = (warning, warn) => {
  if (warning.code === 'UNRESOLVED_IMPORT') return;
  warn(warning);
};

export default [
  {
    input: 'src/worker/bot.ts',
    output: {
      file: 'dist/worker/bot.js',
      format: 'es'
    },
    plugins: commonPlugins,
    external: [
      'fs', 'path', 'queue-promise',
      '@builderbot/bot', '@builderbot/provider-baileys', 'baileys'
    ],
    onwarn
  },
  {
    input: 'src/worker/bot-meta.ts',
    output: {
      file: 'dist/worker/bot-meta.js',
      format: 'es'
    },
    plugins: commonPlugins,
    external: [
      'fs', 'path', 'queue-promise',
      '@builderbot/bot', '@builderbot/provider-meta'
    ],
    onwarn
  }
];
