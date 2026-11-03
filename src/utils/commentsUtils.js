import { marked } from 'marked'
import DOMPurify from 'dompurify'

// Legacy client's prefix marking an object's comments as Markdown. The middle character is DEL.
const MARKDOWN_COMMENTS_INDICATOR = '{\u007F}'

/** @param {string} raw */
export function stripMarkdownPrefix(raw) {
  if (!raw) return ''
  return raw.startsWith(MARKDOWN_COMMENTS_INDICATOR)
    ? raw.slice(MARKDOWN_COMMENTS_INDICATOR.length)
    : raw
}

/** @param {string} text */
export function withMarkdownPrefix(text) {
  return `${MARKDOWN_COMMENTS_INDICATOR}${text ?? ''}`
}

/**
 * The only place `marked` may be called (it does not sanitize; enforced by eslint and
 * noRawMarked.spec.js). `breaks` keeps the layout of legacy plain-text comments.
 * @param {string} text - markdown source, prefix already stripped
 */
export function renderCommentsMarkdown(text) {
  return DOMPurify.sanitize(marked.parse(text ?? '', { breaks: true, async: false }))
}
