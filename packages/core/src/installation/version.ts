declare global {
  const NANOCODE_VERSION: string
  const NANOCODE_CHANNEL: string
}

export const InstallationVersion = typeof NANOCODE_VERSION === "string" ? NANOCODE_VERSION : "local"
export const InstallationChannel = typeof NANOCODE_CHANNEL === "string" ? NANOCODE_CHANNEL : "local"
export const InstallationLocal = InstallationChannel === "local"
