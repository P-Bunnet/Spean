#!/usr/bin/env bash
# Publish a release: scripts/release.sh 0.24.0
# Moves the [Unreleased] changelog notes under the version, sets the version in wails.json, commits,
# tags and pushes. The tag starts .github/workflows/release.yml, which builds and publishes the release.
set -euo pipefail
cd "$(dirname "$0")/.."

die() { echo "error: $*" >&2; exit 1; }

version=${1:-}
version=${version#v}
[[ $version =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "usage: scripts/release.sh 0.24.0"
tag=v$version

[ "$(git branch --show-current)" = main ] || die "switch to main first"
[ -z "$(git status --porcelain)" ] || die "commit or stash your changes first"
git fetch --quiet --tags origin
[ "$(git rev-parse main)" = "$(git rev-parse origin/main)" ] || die "main and origin/main differ; pull or push first"
! git rev-parse -q --verify "refs/tags/$tag" >/dev/null || die "$tag already exists"

grep -q '^## \[Unreleased\]' CHANGELOG.md || die "CHANGELOG.md has no [Unreleased] section"
notes=$(awk '/^## \[/{ if (p) exit; p = /^## \[Unreleased\]/; next } p && NF' CHANGELOG.md)
[ -n "$notes" ] || die "the [Unreleased] section of CHANGELOG.md is empty"

make check test

current=$(sed -n 's/.*"productVersion": "\(.*\)".*/\1/p' wails.json)
printf '\nRelease %s (now %s). Notes:\n\n%s\n\n' "$tag" "$current" "$notes"
read -r -p "Publish $tag to GitHub? [y/N] " answer
[ "$answer" = y ] || [ "$answer" = Y ] || die "cancelled, nothing changed"

awk -v heading="## [$version] — $(date +%F)" '/^## \[Unreleased\]/ { print; print ""; print heading; next } { print }' CHANGELOG.md > CHANGELOG.md.tmp
mv CHANGELOG.md.tmp CHANGELOG.md
sed "s/\"productVersion\": \".*\"/\"productVersion\": \"$version\"/" wails.json > wails.json.tmp
mv wails.json.tmp wails.json

git commit --quiet -am "Release $version"
git tag -a "$tag" -m "Spean $tag"
git push --quiet --atomic origin main "$tag"

echo "Pushed $tag. Follow the build: https://github.com/P-Bunnet/Spean/actions"
