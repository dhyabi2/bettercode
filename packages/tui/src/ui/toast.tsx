import { createContext, useContext, type ParentProps, Show, Index } from "solid-js"
import { createStore } from "solid-js/store"
import { useTheme } from "../context/theme"
import { useTerminalDimensions } from "@opentui/solid"
import { SplitBorder } from "./border"
import { TextAttributes } from "@opentui/core"
export type ToastOptions = {
  title?: string
  message: string
  variant: "info" | "success" | "warning" | "error"
  duration: number
}
type ToastInput = Omit<ToastOptions, "duration"> & { duration?: number }
type ToastEntry = ToastOptions & { id: number }

const MAX_TOASTS = 3
const TOAST_HEIGHT = 5

function isHighPriority(variant: ToastOptions["variant"]) {
  return variant === "error" || variant === "warning"
}

export function Toast() {
  const toast = useToast()
  const { theme } = useTheme()
  const dimensions = useTerminalDimensions()

  return (
    <Index each={toast.toasts}>
      {(current, index) => (
        <box
          position="absolute"
          justifyContent="center"
          alignItems="flex-start"
          top={2 + index * TOAST_HEIGHT}
          right={2}
          maxWidth={Math.min(60, dimensions().width - 6)}
          paddingLeft={2}
          paddingRight={2}
          paddingTop={1}
          paddingBottom={1}
          backgroundColor={theme.backgroundPanel}
          borderColor={theme[current().variant]}
          border={["left", "right"]}
          customBorderChars={SplitBorder.customBorderChars}
        >
          <Show when={current().title}>
            <text attributes={TextAttributes.BOLD} marginBottom={1} fg={theme.text}>
              {current().title}
            </text>
          </Show>
          <text fg={theme.text} wrapMode="word" width="100%">
            {current().message}
          </text>
        </box>
      )}
    </Index>
  )
}

function init() {
  const [store, setStore] = createStore({
    toasts: [] as ToastEntry[],
  })

  const timeoutHandles = new Map<number, NodeJS.Timeout>()
  let nextId = 0

  function remove(id: number) {
    const handle = timeoutHandles.get(id)
    if (handle) clearTimeout(handle)
    timeoutHandles.delete(id)
    setStore(
      "toasts",
      store.toasts.filter((t) => t.id !== id),
    )
  }

  const toast = {
    show(options: ToastInput) {
      const last = store.toasts[store.toasts.length - 1]
      if (last && last.variant === options.variant && last.message === options.message) return

      const entry: ToastEntry = {
        ...options,
        duration: options.duration ?? 5000,
        id: nextId++,
      }

      setStore("toasts", (toasts) => {
        let next = toasts.slice()
        if (isHighPriority(entry.variant)) {
          let insertAt = next.length
          while (insertAt > 0 && !isHighPriority(next[insertAt - 1].variant)) insertAt--
          next.splice(insertAt, 0, entry)
        } else {
          next.push(entry)
        }

        if (next.length > MAX_TOASTS) {
          let dropIndex = next.findIndex((t, i) => i > 0 && !isHighPriority(t.variant))
          if (dropIndex === -1) dropIndex = 1
          const [dropped] = next.splice(dropIndex, 1)
          const handle = timeoutHandles.get(dropped.id)
          if (handle) clearTimeout(handle)
          timeoutHandles.delete(dropped.id)
        }

        return next
      })

      timeoutHandles.set(
        entry.id,
        setTimeout(() => {
          remove(entry.id)
        }, entry.duration).unref(),
      )
    },
    error: (err: any) => {
      if (err instanceof Error)
        return toast.show({
          variant: "error",
          message: err.message,
        })
      toast.show({
        variant: "error",
        message: "An unknown error has occurred",
      })
    },
    get toasts(): ToastEntry[] {
      return store.toasts
    },
  }
  return toast
}

export type ToastContext = ReturnType<typeof init>

const ctx = createContext<ToastContext>()

export function ToastProvider(props: ParentProps) {
  const value = init()
  return <ctx.Provider value={value}>{props.children}</ctx.Provider>
}

export function useToast() {
  const value = useContext(ctx)
  if (!value) {
    throw new Error("useToast must be used within a ToastProvider")
  }
  return value
}
