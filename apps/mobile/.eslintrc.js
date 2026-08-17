module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*', 'node_modules/'],
  overrides: [
    {
      files: ['src/__tests__/**/*.ts', 'src/__tests__/**/*.tsx'],
      rules: {
        // Jest tests intentionally load modules after jest.mock/resetModules
        // so each case receives the expected mock graph. Keep those runtime
        // imports explicit and confined to test files.
        '@typescript-eslint/no-require-imports': 'off',
        'import/first': 'off',
      },
    },
  ],
  rules: {
    // Enforce consistent import order
    'import/order': 'off', // handled by tsc paths
    // Allow empty catch blocks (common in RN for graceful degradation)
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
};
