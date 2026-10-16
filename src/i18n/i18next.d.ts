import type { defaultNS, resources } from './index';

// Typed translation keys: `t('metrics.pace')` compiles, a typo doesn't.
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)['en'];
  }
}
