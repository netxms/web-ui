/**
 * The `command` of `POST /v1/objects/{id}/execute-agent-command`. The server expands `%` macros
 * in it, then splits it on spaces (`SplitCommandLine`): a run in double or single quotes keeps
 * its spaces, adjacent runs join into one argument, and there is no escape character.
 *
 * @param {string} action - agent action name, e.g. `Process.Terminate`
 * @param {Array<string|number>} [args]
 * @returns {string}
 */
export function agentCommandLine(action, args = []) {
  return [action, ...args.map(quoteArgument)].join(' ')
}

function quoteArgument(value) {
  const text = String(value).replaceAll('%', '%%')
  if (text !== '' && !/[ "']/.test(text)) return text
  if (!text.includes('"')) return `"${text}"`
  if (!text.includes("'")) return `'${text}'`
  return text
    .split('"')
    .map((part) => `"${part}"`)
    .join(`'"'`)
}
