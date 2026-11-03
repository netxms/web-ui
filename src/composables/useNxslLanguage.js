import { StreamLanguage } from '@codemirror/language'

const keywords = new Set([
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'default',
  'break',
  'continue',
  'return',
  'exit',
  'sub',
  'function',
  'global',
  'local',
  'array',
  'use',
  'import',
  'try',
  'catch',
  'throw',
  'with',
  'optional',
  'new',
  'this',
])

const operatorKeywords = new Set(['and', 'or', 'not'])

const constants = new Set(['null', 'NULL', 'true', 'false'])

const nxsl = StreamLanguage.define({
  languageData: {
    commentTokens: { line: '//', block: { open: '/*', close: '*/' } },
  },

  startState() {
    return { inBlockComment: false }
  },

  copyState(state) {
    return { inBlockComment: state.inBlockComment }
  },

  token(stream, state) {
    if (state.inBlockComment) {
      if (stream.match('*/')) {
        state.inBlockComment = false
      } else {
        stream.next()
      }
      return 'blockComment'
    }

    if (stream.eatSpace()) return null

    if (stream.match('//')) {
      stream.skipToEnd()
      return 'lineComment'
    }

    if (stream.match('/*')) {
      state.inBlockComment = true
      return 'blockComment'
    }

    if (stream.peek() === '"') {
      stream.next()
      while (!stream.eol()) {
        const ch = stream.next()
        if (ch === '\\') {
          stream.next()
        } else if (ch === '"') {
          break
        }
      }
      return 'string'
    }

    if (stream.peek() === "'") {
      stream.next()
      while (!stream.eol()) {
        const ch = stream.next()
        if (ch === '\\') {
          stream.next()
        } else if (ch === "'") {
          break
        }
      }
      return 'string'
    }

    // $ variables ($node, $1, $ARGS, etc.)
    if (stream.eat('$')) {
      stream.match(/^\w+/)
      return 'variableName.special'
    }

    if (stream.match(/^0[xX][0-9a-fA-F]+/)) return 'number'

    if (stream.match(/^[0-9]+(\.[0-9]+)?([eE][+-]?[0-9]+)?/)) return 'number'

    if (stream.match(/^[a-zA-Z_]\w*/)) {
      const word = stream.current()
      if (keywords.has(word)) return 'keyword'
      if (operatorKeywords.has(word)) return 'operatorKeyword'
      if (constants.has(word)) return 'atom'
      return 'variableName'
    }

    // String concatenation operator
    if (stream.match('..')) return 'operator'

    // Safe navigation
    if (stream.match('?.')) return 'operator'

    // Regex match operator
    if (stream.match('=~')) return 'operator'

    if (stream.match(/^[<>=!]=?/)) return 'operator'

    if (stream.match(/^[+\-*/%&|^~]/)) return 'operator'

    const ch = stream.peek()
    if ('(){}[];,.:?'.includes(ch)) {
      stream.next()
      return 'punctuation'
    }

    stream.next()
    return null
  },
})

export function useNxslLanguage() {
  return nxsl
}
