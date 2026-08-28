import { PermissionV1 } from "@bettercode-ai/core/v1/permission"
import type { Agent } from "./agent"

/**
 * Build the `permission` ruleset for a subagent's session when it's spawned
 * via the task tool. Combines:
 *
 * 1. The parent session's deny rules, ask rules, and external_directory
 *    rules. Parent agent restrictions only govern that agent; the
 *    subagent's own permissions determine its capabilities. Deny and ask
 *    rules propagate because they are restrictions/human-in-the-loop gates,
 *    not capability grants, so they must survive delegation the same way
 *    an external_directory rule does. Bare allow rules do not propagate.
 * 2. Default `todowrite` and `task` denies if the subagent's own ruleset
 *    doesn't already permit them.
 */
export function deriveSubagentSessionPermission(input: {
  parentSessionPermission: PermissionV1.Ruleset
  subagent: Agent.Info
}): PermissionV1.Ruleset {
  // Must check for an explicit "allow" here, not merely "has any rule for this permission" —
  // `task` (and, in principle, any permission) now always has a rule in every agent's merged
  // ruleset because the built-in defaults set `task: "ask"` (safety-permissions-default-allow-all
  // removed the old blanket "*": "allow" seed and gave every category an explicit default). A
  // presence-only check would treat that default "ask" rule as "the subagent permits task",
  // defeating the deny-by-default guard below for every subagent.
  const canTask = input.subagent.permission.some((rule) => rule.permission === "task" && rule.action === "allow")
  const canTodo = input.subagent.permission.some((rule) => rule.permission === "todowrite" && rule.action === "allow")
  return [
    ...input.parentSessionPermission.filter(
      (rule) => rule.permission === "external_directory" || rule.action === "deny" || rule.action === "ask",
    ),
    ...(canTodo ? [] : [{ permission: "todowrite" as const, pattern: "*" as const, action: "deny" as const }]),
    ...(canTask ? [] : [{ permission: "task" as const, pattern: "*" as const, action: "deny" as const }]),
  ]
}
