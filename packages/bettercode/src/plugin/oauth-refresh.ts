// Refresh an OAuth access token a little before it actually expires so a
// single long-running tool call doesn't have to recover from a mid-flight
// 401. Shared by the codex.ts and xai.ts OAuth plugins.
export function isAccessTokenExpiring(expires: number | undefined, skewMs = 120_000): boolean {
  if (!expires) return true
  return expires - Date.now() <= skewMs
}
