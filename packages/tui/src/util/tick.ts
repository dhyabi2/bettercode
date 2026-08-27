import { useRenderer } from "@opentui/solid"

type Renderer = ReturnType<typeof useRenderer>

interface Registration {
  interval: number
  callback: () => void
}

const registrations = new Set<Registration>()
let timer: ReturnType<typeof setInterval> | undefined
let timerInterval: number | undefined

function minInterval(): number | undefined {
  let min: number | undefined
  for (const registration of registrations) {
    if (min === undefined || registration.interval < min) min = registration.interval
  }
  return min
}

function reschedule(renderer: Renderer) {
  const min = minInterval()
  if (min === undefined) {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    timerInterval = undefined
    return
  }
  if (timer !== undefined && timerInterval === min) return
  if (timer !== undefined) clearInterval(timer)
  timerInterval = min
  timer = setInterval(() => {
    for (const registration of registrations) registration.callback()
    renderer.requestRender()
  }, min)
}

export function registerTick(intervalMs: number, callback: () => void): () => void {
  const renderer = useRenderer()
  const registration: Registration = { interval: intervalMs, callback }
  registrations.add(registration)
  reschedule(renderer)
  return () => {
    if (!registrations.delete(registration)) return
    reschedule(renderer)
  }
}
