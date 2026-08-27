import { $ } from "bun"
import { downloadCliToResources } from "./utils"

await $`bun run install-electron`

await $`bun ./scripts/copy-icons.ts ${process.env.NANOCODE_CHANNEL ?? "dev"}`

await $`cd ../nanocode && bun script/build-node.ts`
await downloadCliToResources()
