import { afterAll } from 'vitest'

// jsdom has no layout engine and will not get a ResizeObserver (jsdom/jsdom#3368); PrimeVue
// Popover, TabList and others create one. Specs that need resize callbacks replace it.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// PrimeVue's TabList starts a 150 ms timeout on mount and never clears it, not even on unmount.
// One still pending when a spec file ends fires after jsdom is gone, and "HTMLElement is not
// defined" fails the whole run with every test passing. So nothing outlives its spec file.
const pendingTimeouts = new Set()
const { setTimeout: realSetTimeout, clearTimeout: realClearTimeout } = globalThis

globalThis.setTimeout = (callback, delay, ...args) => {
  const id = realSetTimeout(
    (...callbackArgs) => {
      pendingTimeouts.delete(id)
      callback(...callbackArgs)
    },
    delay,
    ...args,
  )
  pendingTimeouts.add(id)
  return id
}

afterAll(() => {
  pendingTimeouts.forEach((id) => realClearTimeout(id))
  pendingTimeouts.clear()
})
