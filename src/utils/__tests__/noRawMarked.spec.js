// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * eslint keeps `marked`/`dompurify` imports inside commentsUtils; this covers the other half:
 * every `v-html` in `src/` must render a value that comes from `renderCommentsMarkdown()`.
 */

const RENDERER = 'renderCommentsMarkdown'
// vitest runs with the package root as cwd; the sink-count assertion catches a bad path.
const SRC = join(process.cwd(), 'src')

function walk(dir, ext, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, ext, out)
    else if (ext.some((e) => entry.name.endsWith(e))) out.push(full)
  }
  return out
}

/** Text of `const|let|var <name> = ...`, read to the end of the initializer expression. */
function initializerOf(source, name) {
  const decl = new RegExp(String.raw`(?:const|let|var)\s+${name}\s*=`).exec(source)
  if (!decl) return null
  let depth = 0
  let out = ''
  for (let i = decl.index + decl[0].length; i < source.length; i++) {
    const c = source[i]
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) {
      if (depth === 0) break
      depth--
    } else if (c === '\n' && depth === 0) break
    out += c
  }
  return out
}

/** Local names (computed/ref/function results) whose definition renders through the sanitizer. */
function safeNames(source) {
  const names = new Set()
  for (const [, name] of source.matchAll(/(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    if (initializerOf(source, name)?.includes(RENDERER)) names.add(name)
  }
  for (const [, name, body] of source.matchAll(
    /function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{([\s\S]*?)\n\}/g,
  )) {
    if (body.includes(RENDERER)) names.add(name)
  }
  return names
}

/**
 * Names a `v-html` expression pulls HTML from, ignoring parts that cannot reach the DOM:
 * string literals, a ternary condition, arguments passed *into* the sanitizer, and property
 * paths (`a.b` resolves through `a`, which is checked).
 */
function htmlSources(expression) {
  let expr = expression.replaceAll(/'[^']*'|"[^"]*"|`[^`]*`/g, "''")
  const ternary = expr.search(/\?(?![?.])/)
  if (ternary !== -1) expr = expr.slice(ternary + 1)
  let previous
  do {
    previous = expr
    expr = expr.replace(new RegExp(String.raw`${RENDERER}\s*\([^()]*\)`), ' SANITIZED ')
  } while (expr !== previous)
  expr = expr.replaceAll(/\??\.\s*[A-Za-z_$][\w$]*/g, '')
  const ignored = new Set(['SANITIZED', 'true', 'false', 'null', 'undefined'])
  return [...expr.matchAll(/[A-Za-z_$][\w$]*/g)]
    .map(([name]) => name)
    .filter((name) => !ignored.has(name))
}

const sinks = walk(SRC, ['.vue']).flatMap((file) => {
  const source = readFileSync(file, 'utf8')
  const safe = safeNames(source)
  return [...source.matchAll(/v-html\s*=\s*"([^"]*)"|v-html\s*=\s*'([^']*)'/g)].map((match) => ({
    file: relative(SRC, file).replaceAll('\\', '/'),
    expression: match[1] ?? match[2],
    unsafe: htmlSources(match[1] ?? match[2]).filter((name) => !safe.has(name)),
  }))
})

describe('no unsanitized v-html', () => {
  it('finds the v-html sinks in src/', () => {
    // Fails loudly if the scan stops matching, rather than passing on an empty list.
    expect(sinks.length).toBeGreaterThanOrEqual(9)
  })

  it.each(sinks)('$file renders $expression through the sanitizer', ({ unsafe }) => {
    expect(unsafe).toEqual([])
  })

  it('keeps marked and dompurify imports inside commentsUtils', () => {
    const offenders = walk(SRC, ['.vue', '.js'])
      .filter((file) => !file.endsWith('commentsUtils.js') && !file.includes('__tests__'))
      .filter((file) => /from '(marked|dompurify)'/.test(readFileSync(file, 'utf8')))
      .map((file) => relative(SRC, file).replaceAll('\\', '/'))
    expect(offenders).toEqual([])
  })
})
