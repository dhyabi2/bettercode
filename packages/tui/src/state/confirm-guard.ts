import { createSignal } from "solid-js"

export function createPressGuard(resetMs = 5000) {
  const [count, setCount] = createSignal(0)
  let timer: ReturnType<typeof setTimeout> | undefined

  function press() {
    const next = count() + 1
    setCount(next)

    clearTimeout(timer)
    timer = setTimeout(() => {
      setCount(0)
    }, resetMs)

    if (next >= 2) {
      clearTimeout(timer)
      setCount(0)
      return true
    }

    return false
  }

  return { count, press }
}
