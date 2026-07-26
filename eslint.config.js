const js = require('@eslint/js');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  js.configs.recommended,
  ...tsPlugin.configs['flat/recommended'],
  {
    files: ['src/**/*.ts'],
    rules: {
      quotes: [
        'error',
        'single',
        {
          avoidEscape: true
        }
      ],
      'no-trailing-spaces': 'error'
    }
  }
];
