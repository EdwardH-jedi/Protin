module.exports = {
  extends: 'expo',
  ignorePatterns: ['/dist/*', 'node_modules/'],
  rules: {
    // Enforce consistent import order
    'import/order': 'off', // handled by tsc paths
    // Allow empty catch blocks (common in RN for graceful degradation)
    'no-empty': ['error', { allowEmptyCatch: true }],
  },
  overrides: [
    {
      // Jest module mocks need require() inside jest.mock() factories.
      files: ['src/__tests__/**'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
      },
    },
  ],
};
