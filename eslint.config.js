import globals from 'globals';
import eslintPluginAstro from 'eslint-plugin-astro';
import astroEslintParser from 'astro-eslint-parser';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';
// import pluginReactConfig from 'eslint-plugin-react/configs/recommended.js';

export default [
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...eslintPluginAstro.configs.recommended,
  ...eslintPluginAstro.configs['jsx-a11y-recommended'],
  // pluginReactConfig,
  {
    rules: {
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
    }
  },
  {
    ignores: ['node_modules', 'dist', '.astro', 'src/env.d.ts', '**/.obsidian'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.astro'],
    processor: 'astro/client-side-ts',
    languageOptions: {
      parser: astroEslintParser,
      parserOptions: {
        parser: '@typescript-eslint/parser',
        extraFileExtensions: ['.astro'],
      },
    },
  },
];
