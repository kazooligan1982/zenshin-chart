/** Names recognized as the default personal workspace (fallback detection) */
export const DEFAULT_WS_NAMES: readonly string[] = ["マイワークスペース", "My Workspace"];

/** Check by is_personal flag (primary), fall back to name check */
export function isPersonalWorkspace(workspace: { is_personal?: boolean; name?: string | null }): boolean {
  if (workspace.is_personal === true) return true;
  // Fallback for workspaces created before is_personal migration
  return !!workspace.name && DEFAULT_WS_NAMES.includes(workspace.name);
}
