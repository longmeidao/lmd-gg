import globals from 'globals';
import { configs as astroEslintConfigs } from 'eslint-plugin-astro';
import * as astroEslintParser from 'astro-eslint-parser';
import pluginJs from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  ...astroEslintConfigs.recommended,
  ...astroEslintConfigs['jsx-a11y-recommended'],
  {
    rules: {
      'no-unused-vars': 'off',
      'no-undef': 'off',
    },
  },
  {
    ignores: [
      'node_modules',
      'dist',
      '.astro',
      'src/env.d.ts',
      // Wrangler 生成的类型文件。
      'worker-configuration.d.ts',
      '**/.obsidian',
    ],
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
