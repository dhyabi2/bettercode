import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@bettercode-ai/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~bettercode/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~bettercode/WorkspaceRef", {
  defaultValue: () => undefined,
})
