import type { PhotoAccess } from '@/data/photo-library';

import { allowStep, NO_PROMPT_MS, settingsAfterAsking } from './photo-access';

const none = (canAskAgain: boolean): PhotoAccess => ({ level: 'none', canAskAgain });

describe('allowStep', () => {
  it('asks while the system says it would', () => {
    expect(allowStep(none(true), 'ios')).toBe('ask');
    expect(allowStep(none(true), 'android')).toBe('ask');
  });

  it('goes to Settings on iOS once it says it would not ask', () => {
    expect(allowStep(none(false), 'ios')).toBe('settings');
  });

  // Dismissing Android's prompt by tapping outside it made the app offer only "Open Settings".
  it('still asks on Android, which says no after a dismissed prompt', () => {
    expect(allowStep(none(false), 'android')).toBe('ask');
  });
});

describe('settingsAfterAsking', () => {
  it('opens Settings when the system answered at once that it will not ask', () => {
    expect(settingsAfterAsking(none(false), 300)).toBe(true);
  });

  it('leaves the user where they were after answering or dismissing a prompt', () => {
    expect(settingsAfterAsking(none(false), NO_PROMPT_MS + 1500)).toBe(false);
    expect(settingsAfterAsking(none(true), 300)).toBe(false);
  });

  it('does nothing more once there is access', () => {
    expect(settingsAfterAsking({ level: 'all', canAskAgain: true }, 300)).toBe(false);
    expect(settingsAfterAsking({ level: 'limited', canAskAgain: true }, 300)).toBe(false);
  });
});
