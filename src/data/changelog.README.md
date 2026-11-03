# What's New entries

Curated entries for the home page's What's New section. Hand-maintained; update as part of
each frontend release.

```json
[
  {
    "id": 1,
    "title": "Short headline",
    "date": "2026-09-01",
    "summary": "One or two sentences.",
    "link": "https://netxms.com/blog/some-article"
  }
]
```

Rules:

- **Version-neutral only.** Feature highlights and articles - never "NetXMS X.Y released".
  This file is pinned to a frontend build, while the server may run a different version, so a
  release announcement here can contradict the server the user is connected to. Version news
  is the dynamic row's job.
- **Dates are required** and must parse. Entries older than `CHANGELOG_MAX_AGE_DAYS`
  (see `src/config/whatsNew.js`) stop rendering, so an unmaintained file empties rather than
  going stale.
- **Links must be real.** An empty array is correct and renders fine; a wrong link does not.
