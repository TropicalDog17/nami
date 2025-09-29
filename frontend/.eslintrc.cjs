/* eslint-env node */
module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true, jest: true },
  globals: { React: 'readonly', process: 'readonly' },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    project: undefined
  },
  settings: {
    'import/resolver': {
      typescript: { project: './tsconfig.json' }
    },
    react: { version: 'detect' }
  },
  plugins: ['react', 'react-hooks', '@typescript-eslint', 'import', 'react-refresh'],
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier'
  ],
  ignorePatterns: ['dist', '.eslintrc.cjs'],
  rules: {
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'no-undef': 'off',
    'no-unused-vars': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'no-case-declarations': 'off',
    'import/order': [
      'warn',
      {
        groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true }
      }
    ],
    'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
  },
  overrides: [
    {
      files: ['cypress.config.js', 'playwright.config.js'],
      env: { node: true }
    },
    {
      files: ['tests/**/*.*'],
      env: { jest: true, node: true, browser: true },
    }
  ]
}
