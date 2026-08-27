export function computeDeadline(expiresInSeconds?: number, defaultSeconds = 900): number {
  const seconds =
    typeof expiresInSeconds === "number" && Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? expiresInSeconds
      : defaultSeconds
  return Date.now() + seconds * 1000
}

export function isExpired(deadline: number): boolean {
  return Date.now() >= deadline
}
