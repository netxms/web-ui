---
worth: yes
where: src/utils/objectQueryScript.js:163
added: 2026-11-04
---
# object query IP range filter uses the deprecated AddrInRange

`ipClause` generates `AddrInRange(ipAddr, from, to)`. The server registers `AddrInRange` as
deprecated (netxms `src/libnxsl/env.cpp:204`), so compiling the generated script in advanced mode
warns `Function "AddrInRange" is deprecated`, and saved queries keep it. The replacement is the
`InetAddress.inRange(a1, a2)` method (master and stable-5.2), but it needs an `InetAddress` value
rather than the `ipAddr` string, which means checking the constructor or `ipAddress` attribute
across object classes against a live server. Found sweeping for deprecated NXSL calls after the
normal-search `index`/`lower` fix.
