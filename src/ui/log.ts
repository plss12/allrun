/**
 * Records a technical error with context. Users only ever see translated messages; the raw error
 * (often an English library message) goes here, and to Sentry once it is wired in (milestone 5).
 */
export function logError(context: string, error: unknown): void {
  console.error(`[AllRun] ${context}`, error);
}
