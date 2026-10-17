import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'dist/**',
      'build/**',
      'coverage/**',
      'skills/**',
      '.agents/**',
      '.specify/**',
      '**/*.min.js',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
