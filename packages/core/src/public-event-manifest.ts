export * as PublicEventManifest from "./public-event-manifest"

import { Event } from "@nanocode-ai/schema/event"
import { EventManifest } from "@nanocode-ai/schema/event-manifest"

export const Definitions = EventManifest.ServerDefinitions
export const Latest = Event.latest(Definitions)
