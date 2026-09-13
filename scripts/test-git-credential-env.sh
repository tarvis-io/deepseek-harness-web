#!/bin/sh
set -eu

helper=${1:-./git-credential-env}

assert_eq() {
  actual=$1
  expected=$2
  if [ "$actual" != "$expected" ]; then
    printf 'expected:\n%s\nactual:\n%s\n' "$expected" "$actual" >&2
    exit 1
  fi
}

github=$(printf 'protocol=https\nhost=github.com\n\n' | \
  GITHUB_TOKEN=test-github-token "$helper" get)
assert_eq "$github" 'username=x-access-token
password=test-github-token'

gitlab=$(printf 'protocol=https\nhost=gitlab.com\n\n' | \
  GITLAB_TOKEN=test-gitlab-token "$helper" get)
assert_eq "$gitlab" 'username=oauth2
password=test-gitlab-token'

unmatched=$(printf 'protocol=https\nhost=example.com\n\n' | \
  GITHUB_TOKEN=test-github-token GITLAB_TOKEN=test-gitlab-token "$helper" get)
assert_eq "$unmatched" ''

store=$(printf 'protocol=https\nhost=github.com\n\n' | \
  GITHUB_TOKEN=test-github-token "$helper" store)
assert_eq "$store" ''

printf 'git credential helper tests passed\n'
