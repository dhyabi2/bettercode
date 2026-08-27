interface ImportMetaEnv {
  readonly NANOCODE_CHANNEL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module "virtual:nanocode-server" {
  export namespace Server {
    export const listen: typeof import("../../../nanocode/dist/types/src/node").Server.listen
    export type Listener = import("../../../nanocode/dist/types/src/node").Server.Listener
  }
  export namespace Config {
    export const get: typeof import("../../../nanocode/dist/types/src/node").Config.get
    export type Info = import("../../../nanocode/dist/types/src/node").Config.Info
  }
  export const bootstrap: typeof import("../../../nanocode/dist/types/src/node").bootstrap
}
