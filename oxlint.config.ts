import { defineConfig } from 'oxlint';

const MAX_STATEMENTS = 15;

export default defineConfig({
  categories: {
    correctness: 'error',
    nursery: 'error',
    pedantic: 'error',
    perf: 'error',
    restriction: 'error',
    style: 'error',
    suspicious: 'error',
  },
  env: { node: true },
  options: { denyWarnings: true, typeAware: true, typeCheck: true },
  overrides: [
    { files: ['*.config.ts'], rules: { 'import/no-default-export': 'off' } },
    {
      files: ['src/cli.ts', 'src/eval.ts'],
      rules: {
        'eslint/no-await-in-loop': 'off',
        'import/no-relative-parent-imports': 'off',
        'node/no-process-env': 'off',
      },
    },
    {
      files: ['src/extractor.ts'],
      rules: { 'import/no-relative-parent-imports': 'off' },
    },
    {
      files: ['src/openai.ts', 'src/typesafe.ts'],
      rules: { 'eslint/no-await-in-loop': 'off' },
    },
    {
      files: ['tests/**/*.ts'],
      rules: {
        'eslint/no-magic-numbers': 'off',
        'import/no-relative-parent-imports': 'off',
        'promise/avoid-new': 'off',
      },
    },
  ],
  plugins: [
    'eslint',
    'typescript',
    'unicorn',
    'oxc',
    'import',
    'jsdoc',
    'node',
    'promise',
  ],
  rules: {
    'eslint/func-style': 'off',
    'eslint/max-statements': ['error', MAX_STATEMENTS],
    'eslint/no-duplicate-imports': 'off',
    'eslint/no-undefined': 'off',
    'eslint/one-var': 'off',
    'eslint/sort-imports': 'off',
    'eslint/sort-vars': 'off',
    'import/no-named-export': 'off',
    'import/no-nodejs-modules': 'off',
    'no-restricted-imports': [
      'error',
      {
        paths: [
          { message: 'Use the built-in node:test module.', name: 'ava' },
          { message: 'Use node:assert/strict.', name: 'chai' },
          { message: 'Use the built-in node:test module.', name: 'jest' },
          { message: 'Use the built-in node:test module.', name: 'mocha' },
          { message: 'Use the built-in node:test module.', name: 'tap' },
          { message: 'Use the built-in node:test module.', name: 'vitest' },
        ],
        patterns: [
          {
            group: [
              '@jest/*',
              '@vitest/*',
              'ava/*',
              'chai/*',
              'jest/*',
              'mocha/*',
              'tap/*',
              'vitest/*',
            ],
            message: 'Use node:test and node:assert/strict.',
          },
        ],
      },
    ],
    'node/no-top-level-await': 'off',
    'oxc/no-async-await': 'off',
    'oxc/no-optional-chaining': 'off',
    'oxc/no-rest-spread-properties': 'off',
    'typescript/prefer-readonly-parameter-types': 'off',
    'typescript/promise-function-async': 'off',
    'unicorn/numeric-separators-style': 'off',
  },
});
