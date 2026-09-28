/**
 * Common return shape for server actions that mutate data. A code review
 * found several client components flipping to a "success" UI state right
 * after `await`-ing a void-returning action, with no way to tell a real
 * success from a swallowed Supabase error - the action itself never
 * surfaced one. Actions that mutate should return this instead of void,
 * and callers should only update optimistic UI state when `ok` is true.
 */
export interface ActionResult {
  ok: boolean;
  error?: string;
}
