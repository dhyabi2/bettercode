import path from "path"
import fs from "node:fs"
import { execFileSync } from "node:child_process"
import { writeHeapSnapshot } from "node:v8"
import { Flag } from "@bettercode-ai/core/flag/flag"
import { Global } from "@bettercode-ai/core/global"
const MINUTE = 60_000
const LIMIT = 2 * 1024 * 1024 * 1024
const LINUX_PAGE_SIZE = 4096

let timer: Timer | undefined
let lock = false
let armed = true
let divergenceLogged = false

function realRss(): number {
  const reported = process.memoryUsage().rss
  try {
    if (process.platform === "linux") {
      const statm = fs.readFileSync("/proc/self/statm", "utf8")
      const residentPages = Number(statm.split(" ")[1])
      if (Number.isFinite(residentPages)) {
        const actual = residentPages * LINUX_PAGE_SIZE
        logDivergence(reported, actual)
        return actual
      }
    }
    if (process.platform === "darwin") {
      const output = execFileSync("ps", ["-o", "rss=", "-p", String(process.pid)], { encoding: "utf8" })
      const kb = Number(output.trim())
      if (Number.isFinite(kb)) {
        const actual = kb * 1024
        logDivergence(reported, actual)
        return actual
      }
    }
  } catch {}
  return reported
}

function logDivergence(reported: number, actual: number) {
  if (divergenceLogged) return
  if (reported > 0 && actual / reported >= 5) {
    divergenceLogged = true
    console.error(`[heap] process.memoryUsage().rss underreports actual RSS (${reported} vs ${actual})`)
  }
}

export function start() {
  if (!Flag.BETTERCODE_AUTO_HEAP_SNAPSHOT) return
  if (timer) return

  const run = async () => {
    if (lock) return

    const rss = realRss()
    if (rss <= LIMIT) {
      armed = true
      return
    }
    if (!armed) return

    lock = true
    armed = false
    const file = path.join(
      Global.Path.log,
      `heap-${process.pid}-${new Date().toISOString().replace(/[:.]/g, "")}.heapsnapshot`,
    )
    await Promise.resolve()
      .then(() => writeHeapSnapshot(file))
      .catch(() => {})

    lock = false
  }

  timer = setInterval(() => {
    void run()
  }, MINUTE)
  timer.unref?.()
}

export * as Heap from "./heap"
