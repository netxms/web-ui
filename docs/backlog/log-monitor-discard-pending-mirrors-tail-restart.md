---
worth: yes
where: src/components/dashboards/widgets/LogMonitorWidget.vue:189
added: 2026-11-03
---
# log monitor discardPending mirrors useLogLiveTail restarts

Whether a `clear()` drops the seed or live rows depends on `discardPending` mirroring every source `useLogLiveTail` restarts on, so a new restart source breaks it silently. Give `useLogLiveTail` a "no history" option or an `onRestart` hook.

Surfaced by the pre-release comment trim, where the code needed a long comment to be followed.
