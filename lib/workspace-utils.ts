/** Names recognized as the default personal workspace */
export const DEFAULT_WS_NAMES: readonly string[] = ["マイワークスペース", "My Workspace"];

export function isDefaultWorkspaceName(name: string | null | undefined): boolean {
  return !!name && DEFAULT_WS_NAMES.includes(name);
}
