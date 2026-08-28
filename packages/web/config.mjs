const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://bettercode.ai" : `https://${stage}.bettercode.ai`,
  console: stage === "production" ? "https://bettercode.ai/auth" : `https://${stage}.bettercode.ai/auth`,
  email: "help@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/dhyabi2/bettercode",
  discord: "https://bettercode.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
