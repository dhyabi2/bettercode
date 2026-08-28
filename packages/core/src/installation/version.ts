declare global {
  const BETTERCODE_VERSION: string
  const BETTERCODE_CHANNEL: string
}

export const InstallationVersion = typeof BETTERCODE_VERSION === "string" ? BETTERCODE_VERSION : "local"
export const InstallationChannel = typeof BETTERCODE_CHANNEL === "string" ? BETTERCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
