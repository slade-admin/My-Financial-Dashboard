/**
 * Session management helper.
 * In Phase 1, returns static user ID 1 for development/testing.
 * Phase 2 will replace this with real server-side session authentication.
 */
export function currentUserId(): number {
  return 1;
}
