/**
 * Optional server components from `GET /v1/server-info` `components`. The server registers an
 * id only once that subsystem has initialized. A missing component does not remove its
 * endpoints: for AI-ASSISTANT only chat creation and message sending refuse (503), so each
 * surface decides what to gate. Ids are verbatim string literals from the server sources.
 */
export const SERVER_COMPONENTS = {
  /** `AI_ASSISTANT_COMPONENT` in the server's nxai.h. */
  AI_ASSISTANT: 'AI-ASSISTANT',
}

/** Unknown ids fall back to the raw id. */
const COMPONENT_LABELS = {
  [SERVER_COMPONENTS.AI_ASSISTANT]: 'AI assistant',
}

/**
 * @param {string} id
 * @returns {string}
 */
export function labelForComponent(id) {
  return COMPONENT_LABELS[id] ?? id
}
