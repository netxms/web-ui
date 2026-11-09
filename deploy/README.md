# Deploying the console

The console is a static bundle (`dist/`) behind a web server that also forwards `/api` to the
netxmsd WebAPI.

| File | Use |
| --- | --- |
| `nginx/web-ui.conf` | Site config for an nginx host, with TLS |
| `nginx/snippets/` | `/api` proxy, SPA fallback, caching, security headers, sign-in rate limit; also used by the console Docker image |

Docker images: [`docker/README.md`](../docker/README.md).

## How to build a bundle

Prerequisites: Node `^22.22.2 || ^24.15.0 || >=26.0.0` (the `engines` range in `package.json`),
Corepack, and a clean checkout. Run `corepack enable` before using Yarn. On Node 25+, install
Corepack first with `npm install -g corepack@0.36.0`. CI uses Node 26 and that Corepack version.
Vite applies `.env.local` to builds too, so a developer's local settings would ship in the bundle.

```sh
yarn install --immutable   # never regenerate yarn.lock: Vue is pinned to a beta through it
yarn build                 # release bundle; `yarn build --mode demo` adds demo maps and dashboards
```

The result is in `dist/`. Enterprise modules are cloned at `src/modules/<id>/` and named on the
command line: `VITE_MODULES=<id> yarn build`. Public bundles are built without module folders
present.

## Release bundles

Download `web-ui-<version>.tar.gz` and its `.sha256` file from
[GitHub Releases](https://github.com/netxms/web-ui/releases). Verify and extract them in the same
directory, replacing `0.9.0` with the downloaded version:

```sh
sha256sum -c web-ui-0.9.0.tar.gz.sha256
tar -xzf web-ui-0.9.0.tar.gz
```

The bundle's files are inside `web-ui-0.9.0/`; copy that directory's contents into the
web root in place of `dist/.` in the deployment steps below.

To publish a release, bump `package.json`'s `version`, commit the change, and tag that commit
with the matching `v<version>` (for example, `v0.9.0`). Push the commit and tag:

```sh
git push origin main
git push origin v0.9.0
```

The release workflow rejects a tag that differs from `package.json`, runs lint and build, and
publishes the bundle, checksum, and generated release notes. The Docker workflow checks the
version independently and publishes the [console image](../docker/README.md#published-images). A tag
such as `v1.0.0-rc.1` creates a GitHub prerelease and keeps the latest release on the last final
version.

## How to deploy on an nginx host

Prerequisites:

- nginx 1.18 or later and a TLS certificate for the host name.
- netxmsd from a recent NetXMS `master` (7.0 development); against a stable release many views
  fail.
- The netxmsd WebAPI reachable from the nginx host. It listens on `127.0.0.1:8000` by default,
  so nginx on the netxmsd host needs no change.

Steps:

1. Copy the bundle into the web root. Keep the previous build's files: tabs that are already
   open still load from them.

   ```sh
   sudo mkdir -p /var/www/web-ui
   sudo cp -r dist/. /var/www/web-ui/
   ```

2. Install the snippets and the site config, then change it at every `EDIT` mark.

   ```sh
   sudo cp deploy/nginx/snippets/*.conf /etc/nginx/snippets/
   sudo cp deploy/nginx/web-ui.conf /etc/nginx/conf.d/
   ```

3. If geo maps use a tile server other than `tile.netxms.org` (server configuration variable
   `Client.TileServerURL`), add its host to `img-src` in
   `/etc/nginx/snippets/web-ui-app.conf`.

4. Reload nginx and check.

   ```sh
   sudo nginx -t && sudo systemctl reload nginx
   curl -s https://console.example.com/api/         # netxmsd answers with its version
   curl -sI https://console.example.com/alarms      # 200, with a content-security-policy header
   ```

To update, repeat step 1.

## Server settings worth checking

- `WebAPI.AuthTokenMaxLifetime` (seconds, default 86400): a session ends this long after
  sign-in even while in use, so a wall display signs out daily.
- `Client.TileServerURL`: must be `https://`, and its host must be in the CSP `img-src`.

## Troubleshooting

**Reloading a page other than the home page gives a 404.** The site config is not active, or
another `server` block answers for the host name: `sudo nginx -T | grep server_name`.

**Every `/api` call fails with 502.** nginx cannot reach the WebAPI: check the `upstream`
address, and on the netxmsd host `ss -ltn | grep 8000` and "Web API initialized on" in the log.

**Sign-in says "Too many sign-in attempts".** The limit is 10 attempts a minute per client
address after a burst of 20. Many users behind one NAT address can reach it; raise `rate` in
`snippets/web-ui-http.conf`.

**Geo maps show no tiles.** The tile host is missing from the CSP `img-src`, or
`Client.TileServerURL` is `http://`, which browsers block on an HTTPS page.

**Object tool output never arrives.** Something in front of nginx does not pass the WebSocket
upgrade through.
