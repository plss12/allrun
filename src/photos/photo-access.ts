import type { PhotoAccess } from '@/data/photo-library';

/**
 * What tapping "Allow" does without access to the photos. iOS says for sure whether it would still
 * ask. Android says it wouldn't as soon as its prompt is dismissed by tapping outside it, though it
 * would ask again: only a second "Don't allow" makes it final. So Android always asks first, and
 * goes to Settings only when no prompt showed (see `settingsAfterAsking`).
 */
export function allowStep(access: PhotoAccess, platform: string): 'ask' | 'settings' {
  return access.canAskAgain || platform === 'android' ? 'ask' : 'settings';
}

/**
 * The longest a request takes with no prompt to answer. Android doesn't say whether it showed one:
 * once the user said no for good, it still opens its permission screen, which closes by itself in
 * about 300 ms on a modest phone; reading a prompt and answering it takes longer.
 */
export const NO_PROMPT_MS = 500;

/**
 * Whether to open the system's Settings after asking, which took `elapsedMs`: only when the app
 * still has no access, the system wouldn't ask again, and it answered too soon for a prompt. A
 * prompt answered "Don't allow" leaves the user where they were.
 */
export function settingsAfterAsking(after: PhotoAccess, elapsedMs: number): boolean {
  return after.level === 'none' && !after.canAskAgain && elapsedMs < NO_PROMPT_MS;
}
