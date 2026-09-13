#!/bin/sh
# Boots the web profile on 0.0.0.0 (upstream's CLI refuses that flag, so the
# bind comes from a patch overlay) and trusts the authorities listed in
# DSH_TRUSTED_HOSTS (comma separated host, host:port, or URL) besides localhost.
set -eu

sandbox_report() {
  landlock=$(cd /opt/dsh/packages/sandbox/sandbox-local && node --input-type=module \
    -e 'import("@deepseek-ai/node-addon-landlock-run").then(m => console.log(m.probe()))' 2>/dev/null || echo unusable)
  if bwrap --ro-bind / / --dev /dev --proc /proc --unshare-all -- true 2>/dev/null; then
    bwrap=usable
  else
    bwrap=unusable
  fi
  echo "dsh-docker: sandbox backends: bwrap=$bwrap landlock=${landlock:-unusable}"
}

configure_git_credentials() {
  if [ -n "${GITHUB_TOKEN:-}" ]; then
    git config --global --replace-all credential.https://github.com.helper /usr/local/bin/git-credential-env
  fi
  if [ -n "${GITLAB_TOKEN:-}" ]; then
    git config --global --replace-all credential.https://gitlab.com.helper /usr/local/bin/git-credential-env
  fi
}

set -- --no-open "$@"
for entry in $(printf '%s' "${DSH_TRUSTED_HOSTS:-}" | tr ',' ' '); do
  entry=${entry#http://}
  entry=${entry#https://}
  entry=${entry%%/*}
  if [ -n "$entry" ]; then
    set -- --trusted-host "$entry" "$@"
  fi
done
configure_git_credentials
sandbox_report
exec dsh web --patch /etc/dsh/docker.patch.yml "$@"
