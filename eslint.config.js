import js from '@eslint/js';
import ts from 'typescript-eslint';
export default ts.config(
  {
    ignores: [
      'dist/**',
      'dist-server/**',
      'node_modules/**',
      'playwright-report/**',
      'test-results/**',
      'src/assets/**',
    ],
  },
  {
    files: ['src/**/*.{ts,tsx}', 'server/**/*.ts', 'shared/**/*.ts'],
    extends: [js.configs.recommended, ...ts.configs.recommended],
    rules: {
      'no-empty': ['error', { allowEmptyCatch: true }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
