import { getComponentCatalogue } from "@opentui/solid/components"
import { registerSpinner } from "opentui-spinner/solid"

export function registerNanocodeSpinner() {
  if (!getComponentCatalogue().spinner) registerSpinner()
}
