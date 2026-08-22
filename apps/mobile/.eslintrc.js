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
      // Jest hoists `jest.mock(...)` factories above the import block, so the
      // module under test and its mocked dependencies have to be pulled in
      // with `require()` *after* the mocks are declared. Both rules below
      // flag that mandatory pattern, so they are scoped off for tests only —
      // production sources still enforce them.
      files: ['src/__tests__/**/*.{ts,tsx}'],
      rules: {
        '@typescript-eslint/no-require-imports': 'off',
        'import/first': 'off',
      },
    },
  ],
};
