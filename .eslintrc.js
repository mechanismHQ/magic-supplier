module.exports = {
  extends: ['@stacks/eslint-config'],
  settings: {
    react: {
      version: '999.999.999',
    },
  },
  plugins: ['unused-imports'],
  parserOptions: {
    project: 'tsconfig.json',
  },
  rules: {
    '@typescript-eslint/no-unused-vars': [0],
    '@typescript-eslint/explicit-module-boundary-types': [0],
    '@typescript-eslint/no-non-null-assertion': [0],
    '@typescript-eslint/strict-boolean-expressions': [
      2,
      {
        allowNullableString: true,
        allowNullableBoolean: true,
      },
    ],
    // for more strict:
    // 'unused-imports/no-unused-imports': [2],
    'unused-imports/no-unused-imports': [0],
    'unused-imports/no-unused-vars': [
      'error',
      { vars: 'all', varsIgnorePattern: '^_', args: 'after-used', argsIgnorePattern: '^_' },
    ],
  },
};
