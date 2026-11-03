---
worth: later
where: src/components/ai/AiOperatorsTab.vue:42
added: 2026-11-03
---
# AI operators gate is justified only by server internals

The tab blocks instead of showing a notice because, before `InitAIAssistant()`, the server's id counter is 0 and creating an operator would overwrite an existing row. That reasoning lives only in a comment. Wrapping it in a named gate composable would make it explicit. Open: whether the server fixes the counter; then the gate can go instead.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
