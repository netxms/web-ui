/**
 * xterm.js behind the small surface the terminal controller and view need. Imported dynamically,
 * so xterm.js is only downloaded when a terminal opens.
 */
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import '@xterm/xterm/css/xterm.css'
import { copyText } from '@/utils/clipboard'
import { isSafeExternalUrl } from '@/utils/sanitize'
import { terminalShortcut } from '@/utils/sshTerminalProtocol'

const THEMES = {
  light: {
    background: '#ffffff',
    foreground: '#333333',
    cursor: '#333333',
    cursorAccent: '#ffffff',
    selectionBackground: '#add6ff',
    black: '#000000',
    red: '#cd3131',
    green: '#00bc00',
    yellow: '#949800',
    blue: '#0451a5',
    magenta: '#bc05bc',
    cyan: '#0598bc',
    white: '#555555',
    brightBlack: '#666666',
    brightRed: '#cd3131',
    brightGreen: '#14ce14',
    brightYellow: '#b5ba00',
    brightBlue: '#0451a5',
    brightMagenta: '#bc05bc',
    brightCyan: '#0598bc',
    brightWhite: '#a5a5a5',
  },
  dark: {
    background: '#1e1e1e',
    foreground: '#cccccc',
    cursor: '#cccccc',
    cursorAccent: '#1e1e1e',
    selectionBackground: '#264f78',
    black: '#000000',
    red: '#cd3131',
    green: '#0dbc79',
    yellow: '#e5e510',
    blue: '#2472c8',
    magenta: '#bc3fbc',
    cyan: '#11a8cd',
    white: '#e5e5e5',
    brightBlack: '#666666',
    brightRed: '#f14c4c',
    brightGreen: '#23d18b',
    brightYellow: '#f5f543',
    brightBlue: '#3b8eea',
    brightMagenta: '#d670d6',
    brightCyan: '#29b8db',
    brightWhite: '#e5e5e5',
  },
}

/** Output comes from the device, so a link in it opens only on a deliberate ctrl/cmd+click. */
function openLink(event, uri) {
  if (!event.ctrlKey && !event.metaKey) return
  if (isSafeExternalUrl(uri)) window.open(uri, '_blank', 'noopener,noreferrer')
}

function monoFontStack() {
  const stack = getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim()
  return stack || 'monospace'
}

/**
 * @param {object} callbacks
 * @param {(text: string) => void} callbacks.onPaste - a paste the view has to approve
 * @param {() => void} callbacks.onFind
 * @param {(hasSelection: boolean) => void} callbacks.onSelectionChange
 */
export function createEmulator({ onPaste, onFind, onSelectionChange }) {
  const surface = document.createElement('div')
  surface.style.width = '100%'
  surface.style.height = '100%'

  const term = new Terminal({
    cursorBlink: true,
    scrollback: 10000,
    fontFamily: monoFontStack(),
    minimumContrastRatio: 4.5,
    theme: THEMES.light,
    linkHandler: { activate: openLink },
  })
  const fitAddon = new FitAddon()
  const searchAddon = new SearchAddon()
  term.loadAddon(fitAddon)
  term.loadAddon(searchAddon)
  term.loadAddon(new WebLinksAddon(openLink))

  let opened = false
  let webgl = null

  function disableWebgl() {
    webgl?.dispose()
    webgl = null
  }

  // Browsers cap WebGL contexts per page, so only the terminal on screen holds one. Without one
  // xterm falls back to its DOM renderer.
  function enableWebgl() {
    if (webgl) return
    try {
      const addon = new WebglAddon()
      addon.onContextLoss(disableWebgl)
      term.loadAddon(addon)
      webgl = addon
    } catch {
      webgl = null
    }
  }

  function copySelection() {
    return copyText(term.getSelection())
  }

  term.attachCustomKeyEventHandler((event) => {
    const shortcut = terminalShortcut(event)
    if (!shortcut) return true
    if (event.type === 'keydown') {
      if (shortcut === 'copy') {
        // Otherwise Ctrl+Shift+C opens the browser's element picker.
        event.preventDefault()
        copySelection()
      } else if (shortcut === 'find') {
        event.preventDefault()
        onFind()
      }
      // 'paste' and 'leave' stay with the browser: its paste event, and useRegionFocus for F6.
    }
    return false
  })

  term.onSelectionChange(() => onSelectionChange(term.hasSelection()))

  // Capture phase, ahead of xterm's own handler on the elements inside.
  surface.addEventListener(
    'paste',
    (event) => {
      event.preventDefault()
      event.stopPropagation()
      const text = event.clipboardData?.getData('text/plain')
      if (text) onPaste(text)
    },
    true,
  )

  return {
    onData: (handler) => term.onData(handler),
    onBinary: (handler) => term.onBinary(handler),
    write: (data) => term.write(data),
    focus: () => term.focus(),
    clear: () => term.clear(),
    reset: () => term.reset(),
    copySelection,
    paste: (text) => term.paste(text),
    get bracketedPaste() {
      return term.modes.bracketedPasteMode
    },
    findNext: (text) => searchAddon.findNext(text),
    findPrevious: (text) => searchAddon.findPrevious(text),
    clearFind: () => term.clearSelection(),

    setDark(dark) {
      const theme = THEMES[dark ? 'dark' : 'light']
      term.options.theme = theme
      surface.style.background = theme.background
    },

    setFontSize(size) {
      term.options.fontSize = size
    },

    attach(host) {
      host.appendChild(surface)
      if (!opened) {
        term.open(surface)
        opened = true
      }
      enableWebgl()
      term.refresh(0, term.rows - 1)
    },

    detach() {
      disableWebgl()
      surface.remove()
    },

    /** @returns {{ columns: number, rows: number }|null} null while off screen */
    fit() {
      if (!opened || !surface.isConnected) return null
      const proposed = fitAddon.proposeDimensions()
      if (!proposed || !Number.isFinite(proposed.cols) || !Number.isFinite(proposed.rows)) {
        return null
      }
      fitAddon.fit()
      return { columns: term.cols, rows: term.rows }
    },

    dispose() {
      disableWebgl()
      term.dispose()
      surface.remove()
    },
  }
}
