/**
 * Application-wide constants and configuration
 */
export const config = {
  // Base URL
  baseUrl: "https://bettercode.ai",

  // GitHub
  github: {
    repoUrl: "https://github.com/dhyabi2/bettercode",
    starsFormatted: {
      compact: "195K",
      full: "195,000",
    },
  },

  // Social links
  social: {
    twitter: "https://x.com/bettercode",
    discord: "https://discord.gg/bettercode",
  },

  // Static stats (used on landing page)
  stats: {
    contributors: "950",
    commits: "13,000",
    monthlyUsers: "16M",
  },
} as const
