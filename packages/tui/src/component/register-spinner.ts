import { getComponentCatalogue } from "@opentui/solid/components"
import { registerSpinner } from "opentui-spinner/solid"

export function registerBettercodeSpinner() {
  if (!getComponentCatalogue().spinner) registerSpinner()
}
