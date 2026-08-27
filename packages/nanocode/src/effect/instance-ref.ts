import { Context } from "effect"
import type { InstanceContext } from "@/project/instance-context"
import type { WorkspaceV2 } from "@nanocode-ai/core/workspace"

export const InstanceRef = Context.Reference<InstanceContext | undefined>("~nanocode/InstanceRef", {
  defaultValue: () => undefined,
})

export const WorkspaceRef = Context.Reference<WorkspaceV2.ID | undefined>("~nanocode/WorkspaceRef", {
  defaultValue: () => undefined,
})
