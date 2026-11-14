// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    // Edge Functions run on Deno, with its own imports: Supabase checks them on deploying.
    ignores: ['dist/*', '.claude/skills/*', 'supabase/functions/*'],
  },
  // A promise nobody awaits loses its errors and its order: un-awaited file writes left the designs
  // journal half-written. eslint-config-expo registers the @typescript-eslint plugin and parser.
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { parserOptions: { projectService: true, tsconfigRootDir: __dirname } },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: false }],
    },
  },
  // The app looks the same on every phone (ADR 013): its own icons and letter, never the system's.
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/ui/text.tsx'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'react-native',
              importNames: ['Text'],
              message: 'Use Text from @/ui/text: the same letter on every phone.',
            },
            { name: 'expo-symbols', message: 'Use AppIcon from @/ui/app-icon: the same icons.' },
            {
              name: 'react-native',
              importNames: ['ActivityIndicator'],
              message: 'Use Spinner from @/ui/spinner: the same indicator on every phone.',
            },
          ],
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='adjustsFontSizeToFit']",
          message:
            'On Android it shrinks text even when it fits, and moves it off center: choose the size by the length of the text (see actionLabelSize).',
        },
      ],
    },
  },
]);
