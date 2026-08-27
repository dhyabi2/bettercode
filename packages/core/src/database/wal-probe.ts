export * as WalProbe from "./wal-probe"

import { existsSync, readFileSync, renameSync, writeFileSync } from "fs"

const LOCK_STALE_MS = 24 * 60 * 60 * 1000

export function probeWalSupport(runPragma: () => { journal_mode?: unknown } | undefined | void): boolean {
  try {
    const row = runPragma()
    const mode = typeof row?.journal_mode === "string" ? row.journal_mode.toLowerCase() : undefined
    return mode === "wal"
  } catch {
    return false
  }
}

export function quarantineCorruptDatabase(filename: string) {
  if (filename === ":memory:") return
  const timestamp = Date.now()
  for (const suffix of ["", "-wal", "-shm"]) {
    const source = `${filename}${suffix}`
    if (!existsSync(source)) continue
    try {
      renameSync(source, `${source}.corrupt-${timestamp}`)
    } catch {}
  }
}

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (cause: any) {
    return cause?.code === "EPERM"
  }
}

export interface ConflictingLock {
  readonly pid: number
  readonly startedAt: number
}

export function checkConflictingLock(filename: string): ConflictingLock | undefined {
  if (filename === ":memory:") return undefined
  const lockPath = `${filename}.lock`
  try {
    if (!existsSync(lockPath)) return undefined
    const content = readFileSync(lockPath, "utf8").trim()
    const [pidStr, startedAtStr] = content.split(":")
    const pid = Number(pidStr)
    const startedAt = Number(startedAtStr)
    if (!Number.isFinite(pid) || pid === process.pid) return undefined
    if (Date.now() - startedAt > LOCK_STALE_MS) return undefined
    if (!isProcessAlive(pid)) return undefined
    return { pid, startedAt }
  } catch {
    return undefined
  }
}

export function writeLock(filename: string) {
  if (filename === ":memory:") return
  try {
    writeFileSync(`${filename}.lock`, `${process.pid}:${Date.now()}`)
  } catch {}
}
