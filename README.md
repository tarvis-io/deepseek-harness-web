# deepseek-harness-web

Container packaging for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
(`dsh`). The image builds upstream from a pinned git ref and serves the Web UI
(`dsh web`) on port 3080. It runs on a laptop with Docker, on a Coolify host, and as a
hosted app on a Tarvis device or cloud workspace.

Upstream is a developer preview with breaking changes between refs. Read its
[safety notice](https://github.com/deepseek-ai/deepseek-harness/blob/master/SAFETY.md):
the agent reads and edits files and runs commands inside the container, so treat the
port as shell access.

## Image

`ghcr.io/tarvis-io/deepseek-harness-web`, built by the `image` workflow on every push to
`main` and on manual dispatch (which takes an upstream ref).

| Tag | Meaning |
|---|---|
| `latest` | newest build of `main` |
| `dsh-v0.1.2-rc.1` | the upstream ref the build pinned |
| `sha-<short>` | this repository's commit |

Every tag is a multi-arch manifest for `linux/amd64` and `linux/arm64`. Each platform is
built on its own native runner because the Landlock launcher is compiled for the build
host with `musl-gcc`; Tarvis cloud workspaces are Hetzner CAX machines (arm64) and Tarvis
devices are Raspberry Pi 5 (arm64), Coolify hosts are amd64. The workflow boots each
image and checks the login flow and the sandbox probe before publishing the manifest.

## Run with Docker Compose

```sh
cp .env.example .env    # optional, defaults are fine for a local run
docker compose up -d
docker compose logs -f dsh
```

`docker compose up -d --build` builds from source instead of pulling.

The log prints two lines that matter:

```
dsh-docker: sandbox backends: bwrap=unusable landlock=full
dsh web: http://127.0.0.1:3080/?token=...
```

Open the second URL. The token is minted per process and is the only way to get a browser
session; visiting it sets a 30 day cookie, and every other request to `/` answers 401.
After a restart, take the new URL from the logs if the cookie has expired.

Then, in the UI: Settings > Models to enter an API key, and Choose workspace to add
`/workspace`.

## Run on a Tarvis device or cloud workspace

Install `tarvis.compose.yaml` as an app, either through the Personal Cloud page or with
the `app_install` tool (`name: dsh`, `compose:` the file's content). The device routes
`https://dsh.<device-domain>` to the container and fills `SERVICE_FQDN_DSH` with that name, which the
entrypoint turns into the trusted authority the `/api` fence needs.

First login: read the app's logs (`app_logs`), copy the token from the `dsh web:` line,
and open `https://dsh.<device-domain>/?token=<token>`. The app shows healthy as soon as
the server answers, since the health probe accepts the 401.

## Reaching it from another machine

The `/api` fence refuses any request whose `Host` header is neither localhost nor a
declared authority, so list what you type in the browser:

```sh
# .env
DSH_BIND=0.0.0.0
DSH_TRUSTED_HOSTS=192.168.1.10:3080,dsh.example.com
```

Entries are `host` (any port), `host:port` (exact), or a URL (scheme and path are
dropped). Behind a reverse proxy such as Traefik or Coolify, declare the public domain;
the proxy talks to the container on port 3080 and no host port needs publishing. Put an
authenticating proxy in front for anything reachable beyond your LAN. Upstream has no user
accounts, only the launch token above.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `DSH_TAG` | `latest` | Image tag compose runs |
| `DSH_BIND` | `127.0.0.1` | Host interface compose publishes on |
| `DSH_PORT` | `3080` | Host port compose publishes on |
| `DSH_TRUSTED_HOSTS` | empty | Comma separated authorities accepted by the `/api` fence |
| `DSH_WORKSPACE` | named volume | Host directory mounted at `/workspace` |
| `DSH_PERMISSION_MODE` | `workspace-write` | Session sandbox fallback: `read-only`, `workspace-write`, `danger-full-access` |

Extra arguments in a compose `command:` are appended to `dsh web`. Any other `DSH_*` or
provider variable in `.env` reaches the process as well.

## Data

| Path | Holds |
|---|---|
| `/data/dsh` (`DSH_HOME`) | Profiles, sessions, credentials, the browser cookie secret |
| `/workspace` | Project files the agent works on |

Both are named volumes by default. Back up `/data/dsh` to keep sessions and keys.

## Sandboxing inside a container

Upstream confines commands with bubblewrap first, then Landlock, and fails closed when
neither works. Bubblewrap needs unprivileged user namespaces, which container runtimes
block by default, so the Landlock launcher is what enforces here. It needs a kernel with
Landlock (5.13+) and a seccomp profile that allows it, both true for current Docker and
Podman hosts. The `dsh-docker: sandbox backends:` log line reports what the probe found at
boot. If it says `landlock=unusable`, sessions fail with a sandbox error until you set
`DSH_PERMISSION_MODE=danger-full-access`; the container boundary is then the only
confinement.

## Updating upstream

Change the `DSH_REF` default in the `Dockerfile` and push, or dispatch the `image`
workflow with a ref. Refs are upstream tags (`dsh-v*`), branches, or commits. For a local
one-off build:

```sh
docker compose build --build-arg DSH_REF=dsh-v0.1.3
```

## How the image works

- `Dockerfile` builds from source on Node 24 with pnpm 11.7 (`pnpm install`, the Landlock
  native build, `pnpm run build`) and copies the whole built tree to a slim
  runtime image that runs as the `node` user.
- `dsh.docker.patch.yml` is a patch overlay that binds the webserver row to `0.0.0.0`.
  Upstream's `--host 0.0.0.0` flag is refused on purpose; the schema still accepts it.
- `docker-entrypoint.sh` prints the sandbox probe, runs `dsh web --patch ... --no-open`,
  and turns `DSH_TRUSTED_HOSTS` into repeated `--trusted-host` flags.
- `/usr/local/bin/dsh` wraps the built CLI, so `docker compose exec dsh dsh --help` and
  `dsh plugin --profile web add <pkg>` work as upstream documents.
