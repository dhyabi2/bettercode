import { describe, expect, test } from "bun:test"
import { Identifier } from "@/id/id"

describe("Identifier.create", () => {
  test("clamps a backward clock jump so ids keep increasing", () => {
    const first = Identifier.create("ses", "ascending", 1_000_000)
    const second = Identifier.create("ses", "ascending", 999_000)
    expect(second > first).toBe(true)
  })

  test("rolls counter overflow into the timestamp instead of colliding", () => {
    const ts = 2_000_000
    let previous = Identifier.create("ses", "ascending", ts)
    for (let i = 0; i < 5000; i++) {
      const next = Identifier.create("ses", "ascending", ts)
      expect(next > previous).toBe(true)
      previous = next
    }
  })

  test("timestamp() round-trips on ids minted via the overflow path", () => {
    const ts = 3_000_000
    let last = ""
    for (let i = 0; i < 4200; i++) {
      last = Identifier.create("ses", "ascending", ts)
    }
    expect(Identifier.timestamp(last)).toBeGreaterThanOrEqual(ts)
  })
})
