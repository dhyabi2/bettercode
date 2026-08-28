interface ImportMetaEnv {
  readonly BETTERCODE_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:bettercode-server" {
  export namespace Server {
    export const listen: typeof import("../../../bettercode/dist/types/src/node").Server.listen
    export type Listener = import("../../../bettercode/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../bettercode/dist/types/src/node").Config.get
    export type Info = import("../../../bettercode/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../bettercode/dist/types/src/node").bootstrap
}
