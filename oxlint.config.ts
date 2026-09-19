import { defineConfig } from 'oxlint';

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
  },
});
