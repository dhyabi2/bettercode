import { Effect } from "effect"
import type { FSUtil } from "../fs-util"
import type { EffectFlock } from "./effect-flock"

export namespace LockedJsonFile {
  export const mutate = <A>(
    fs: FSUtil.Interface,
    flock: EffectFlock.Interface,
    filePath: string,
    updater: (data: Record<string, A>) => Record<string, A> | undefined,
  ) =>
    Effect.gen(function* () {
      const data = (yield* fs.readJson(filePath).pipe(
        Effect.catchReason("PlatformError", "NotFound", () => Effect.succeed({})),
      )) as Record<string, A>
      const next = updater(data)
      if (!next) return
      yield* fs.writeJson(filePath, next, 0o600)
    }).pipe(flock.withLock(`file:${filePath}`))
}
