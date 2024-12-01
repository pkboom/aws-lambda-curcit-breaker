module.exports = {
  extends: ['eslint:recommended', 'plugin:vue/vue3-recommended', 'prettier'],
  parserOptions: {
    sourceType: 'module',
  },
  plugins: ['jest'],
  rules: {
    quotes: ['warn', 'single'],
    semi: ['warn', 'never'],
    'comma-dangle': ['warn', 'always-multiline'],
    'vue/max-attributes-per-line': 0,
    'vue/require-default-prop': 0,
    'vue/singleline-html-element-content-newline': 0,
    'vue/html-self-closing': [
      'warn',
      {
        html: {
          void: 'always',
          normal: 'always',
          component: 'always',
        },
        svg: 'always',
        math: 'always',
      },
    ],
  },
}
