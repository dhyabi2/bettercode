import { describe, test, expect } from "bun:test"
import type { PermissionV1 } from "@bettercode-ai/core/v1/permission"
import { deriveSubagentSessionPermission } from "../src/agent/subagent-permissions"
import type { Agent } from "../src/agent/agent"

function subagent(permission: PermissionV1.Ruleset): Agent.Info {
  return { permission } as Agent.Info
}

describe("deriveSubagentSessionPermission", () => {
  test("parent bash ask propagates and overrides subagent's default allow", () => {
    const parentSessionPermission: PermissionV1.Ruleset = [{ permission: "bash", pattern: "*", action: "ask" }]
    const result = deriveSubagentSessionPermission({
      parentSessionPermission,
      subagent: subagent([{ permission: "bash", pattern: "*", action: "allow" }]),
    })
    const bashRule = result.findLast((rule) => rule.permission === "bash")
    expect(bashRule?.action).toBe("ask")
  })

  test("parent bash deny still propagates and wins over subagent's allow", () => {
    const parentSessionPermission: PermissionV1.Ruleset = [{ permission: "bash", pattern: "*", action: "deny" }]
    const result = deriveSubagentSessionPermission({
      parentSessionPermission,
      subagent: subagent([{ permission: "bash", pattern: "*", action: "allow" }]),
    })
    const bashRule = result.findLast((rule) => rule.permission === "bash")
    expect(bashRule?.action).toBe("deny")
  })

  test("permission the parent never mentioned is left for the subagent's own ruleset (no over-broad lockdown)", () => {
    const result = deriveSubagentSessionPermission({
      parentSessionPermission: [],
      subagent: subagent([{ permission: "edit", pattern: "*", action: "allow" }]),
    })
    const editRule = result.find((rule) => rule.permission === "edit")
    expect(editRule).toBeUndefined()
  })

  test("external_directory rules still propagate", () => {
    const parentSessionPermission: PermissionV1.Ruleset = [
      { permission: "external_directory", pattern: "/etc/*", action: "deny" },
    ]
    const result = deriveSubagentSessionPermission({
      parentSessionPermission,
      subagent: subagent([]),
    })
    expect(result.some((rule) => rule.permission === "external_directory" && rule.action === "deny")).toBe(true)
  })

  test("bare parent allow rules do not propagate", () => {
    const parentSessionPermission: PermissionV1.Ruleset = [{ permission: "bash", pattern: "*", action: "allow" }]
    const result = deriveSubagentSessionPermission({
      parentSessionPermission,
      subagent: subagent([]),
    })
    expect(result.some((rule) => rule.permission === "bash")).toBe(false)
  })
})
