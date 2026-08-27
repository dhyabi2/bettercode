const stage = process.env.SST_STAGE || "dev"

export default {
  url: stage === "production" ? "https://nanocode.ai" : `https://${stage}.nanocode.ai`,
  console: stage === "production" ? "https://nanocode.ai/auth" : `https://${stage}.nanocode.ai/auth`,
  email: "help@anoma.ly",
  socialCard: "https://social-cards.sst.dev",
  github: "https://github.com/dhyabi2/nanocode",
  discord: "https://nanocode.ai/discord",
  headerLinks: [
    { name: "app.header.home", url: "/" },
    { name: "app.header.docs", url: "/docs/" },
  ],
}
