#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: ./release.sh 1.0.0" >&2
}

fail() {
  echo "release.sh: $*" >&2
  exit 1
}

run_without_warnings() {
  local label="$1"
  shift
  local log_file
  log_file="$(mktemp)"

  echo "==> ${label}"
  if ! "$@" 2>&1 | tee "${log_file}"; then
    rm -f "${log_file}"
    fail "${label} failed"
  fi

  if grep -Eiq '(^|[^[:alpha:]])(warn|warning|deprecated)([^[:alpha:]]|$)' "${log_file}"; then
    echo >&2
    cat "${log_file}" >&2
    rm -f "${log_file}"
    fail "${label} emitted a warning"
  fi

  rm -f "${log_file}"
}

if [ "$#" -ne 1 ]; then
  usage
  exit 1
fi

version="${1#v}"
if ! [[ "${version}" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  usage
  fail "version must be plain semver, for example 1.0.0"
fi

tag="v${version}"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || fail "must be run from inside the git repository"

branch="$(git symbolic-ref --quiet --short HEAD || true)"
[ -n "${branch}" ] || fail "cannot release from a detached HEAD"
[ "${branch}" = "master" ] || fail "must be run from master, current branch is ${branch}"

git remote get-url origin >/dev/null 2>&1 || fail "missing git remote named origin"

if [ -n "$(git status --porcelain)" ]; then
  git status --short >&2
  fail "working tree must be clean before release"
fi

if git rev-parse --quiet --verify "refs/tags/${tag}" >/dev/null; then
  fail "local tag ${tag} already exists"
fi

if git ls-remote --exit-code --tags origin "refs/tags/${tag}" >/dev/null 2>&1; then
  fail "remote tag ${tag} already exists on origin"
fi

echo "==> Applying version ${version}"
npm version "${version}" --no-git-tag-version

run_without_warnings "Typecheck" npm run typecheck
run_without_warnings "Production build" npm run build

git add package.json package-lock.json
git commit -m "chore: release ${tag}"

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [ -n "${upstream}" ]; then
  git push
else
  git push -u origin "${branch}"
fi

git tag -a "${tag}" -m "Release ${tag}"
git push origin "${tag}"

echo "==> Released ${tag}"
