// jsdom has no layout engine and will not get a ResizeObserver (jsdom/jsdom#3368); PrimeVue
// Popover, TabList and others create one. Specs that need resize callbacks replace it.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
}
