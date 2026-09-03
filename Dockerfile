# syntax=docker/dockerfile:1.7
# Builds DeepSeek Harness (dsh) from an upstream git ref and ships the built
# tree, served through `dsh web` bound to all interfaces of the container.
# Multi-arch: build natively per platform (the Landlock launcher is compiled
# for the build host with musl-gcc).
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm AS build
ARG DSH_REPO=https://github.com/deepseek-ai/deepseek-harness.git
ARG DSH_REF=dsh-v0.1.2-rc.1
ARG PNPM_VERSION=11.7.0
ENV CI=true
RUN apt-get update \
 && apt-get install -y --no-install-recommends musl-tools \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@${PNPM_VERSION}
WORKDIR /src
RUN git init -q . \
 && git remote add origin "${DSH_REPO}" \
 && git fetch -q --depth 1 origin "${DSH_REF}" \
 && git checkout -q FETCH_HEAD
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir /pnpm/store
# The Landlock launcher binaries are git-ignored workspace packages, so without
# this step the sandbox has no usable backend inside a container.
RUN pnpm -C native/landlock-run run build:native \
 && test -x native/landlock-run/packages/linux-*/bin/landlock-run
RUN pnpm run build \
 && pnpm prune --prod --ignore-scripts

FROM node:${NODE_VERSION}-bookworm-slim
ARG PNPM_VERSION=11.7.0
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      bash bubblewrap ca-certificates curl git openssh-client procps tini \
 && rm -rf /var/lib/apt/lists/* \
 && npm install -g pnpm@${PNPM_VERSION}
COPY --from=build --chown=node:node /src /opt/dsh
COPY --chmod=755 dsh docker-entrypoint.sh /usr/local/bin/
COPY dsh.docker.patch.yml /etc/dsh/docker.patch.yml
ENV DSH_HOME=/data/dsh
RUN mkdir -p /data/dsh /workspace && chown -R node:node /data /workspace
USER node
WORKDIR /workspace
EXPOSE 3080
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3080/ | grep -qE '^(200|401)$'
ENTRYPOINT ["tini", "--", "docker-entrypoint.sh"]
