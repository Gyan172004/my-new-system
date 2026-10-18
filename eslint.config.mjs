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
      '.local/**',
      '**/*.min.js',
    ],
  },
  {
    files: ['**/*.cjs'],
    languageOptions: {
      sourceType: 'commonjs',
      globals: { module: 'readonly' },
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
