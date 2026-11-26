// Revisa los modulos del front de a uno. Las pruebas unen todos los modulos en
// un solo ambito, asi que no detectan un import olvidado; esta regla si.
import globals from 'globals';

export default [{
  files: ['**/*.js'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', globals: { ...globals.browser } },
  rules: {
    'no-undef': 'error',
    'no-import-assign': 'error',
    'no-redeclare': 'error',
    'no-dupe-keys': 'error',
  },
}];
