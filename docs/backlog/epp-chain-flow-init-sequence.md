---
worth: yes
where: src/components/epp/EppChainFlow.vue:437
added: 2026-11-03
---
# EPP chain flow cytoscape init order is a workaround

The blurry first render is avoided by loading dagre before creating cytoscape and re-applying the stylesheet twice. Move cytoscape setup, layout and repaint into one composable with a single, documented init sequence.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
