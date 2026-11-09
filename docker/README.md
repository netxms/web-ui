# Docker images

Build from the repository root, from a clean checkout: the build context includes any module
folder under `src/modules/`. Both images serve plain HTTP on port 80; put TLS in front for
anything beyond a demo.

| File | Use |
| --- | --- |
| `Dockerfile` | Both images: the console (default target) and `demo` |
| `nginx.conf.template` | Site config of the console image; the rules come from `deploy/nginx/snippets/` |
| `demo-server.js` | Server of the demo image |

The root `Makefile` wraps the commands below: `make image`, `make demo`, `make run` (console
against netxmsd on the Docker host, or `NETXMS_WEBAPI=host:port`), `make run-demo`. `PORT`
(default 8080), `VITE_MODULES` and `VITE_FORCE_MODULES` are passed through.

## Published images

`.github/workflows/docker.yml` builds both images for `linux/amd64` and `linux/arm64` on every
push and pull request. Only the console image is published, from `main` and from release tags;
the demo image is for development and is built locally.

| Image | Tags |
| --- | --- |
| `ghcr.io/netxms/netxms-console` | `main`, `sha-<commit>`; `<version>`, `<major>.<minor>`, `latest` from a `v<version>` tag, only `<version>` from a prerelease tag (`v1.0.0-rc.1`) |

```sh
docker run -d --name netxms-console -p 8080:80 -e NETXMS_WEBAPI=10.0.0.5:8000 ghcr.io/netxms/netxms-console:latest
```

It is built without enterprise modules.

## Console

The release bundle on nginx, proxying `/api` to netxmsd. The WebAPI must be reachable from the
container. It listens on loopback only by default; to accept other hosts, set this in
`netxmsd.conf`, restart netxmsd and firewall port 8000 (the WebAPI has no TLS).

```ini
[WEBAPI]
Address = 0.0.0.0
Port = 8000
```

```sh
docker build -f docker/Dockerfile -t netxms-console .
docker run -d --name netxms-console -p 8080:80 -e NETXMS_WEBAPI=10.0.0.5:8000 netxms-console
```

If the container exits right after start and `docker logs netxms-console` shows
`host not found in upstream`, `NETXMS_WEBAPI` does not resolve inside the container. The rest of
the nginx setup and its troubleshooting: [`deploy/README.md`](../deploy/README.md).

## Demo

The demo bundle on the mock data in `mocks/`, with no server. Any user name and password signs
in. Most edits are not saved; the few the mocks support last until the container restarts.

```sh
docker build -f docker/Dockerfile --target demo -t netxms-console-demo .
docker run -d --name netxms-console-demo -p 8080:80 netxms-console-demo
```

## Enterprise modules

Add `--build-arg VITE_MODULES=<id> --build-arg VITE_FORCE_MODULES=<id>` to either build. The
demo needs `VITE_FORCE_MODULES`, because the mock server reports no modules, and gets only the
listed modules' mocks.
