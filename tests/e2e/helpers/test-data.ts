/**
 * Helpers for creating and tearing down deterministic test data.
 *
 * All E2E-created resources are tagged with the E2E_PREFIX so a global
 * teardown (or manual cleanup) can identify them.
 */

export const E2E_PREFIX = "[E2E]";

/**
 * Generate a unique test resource title. The timestamp suffix prevents
 * collisions across parallel workers and lets you spot stale data in the DB.
 */
export function uniqueTitle(label: string): string {
  return `${E2E_PREFIX} ${label} ${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;
}
