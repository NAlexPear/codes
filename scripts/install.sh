#!/bin/sh

set -eu

repository='NAlexPear/codes'
version=${CODES_VERSION:-${1:-}}
install_directory=${CODES_INSTALL_DIR:-"$HOME/.local/bin"}

fail() {
  printf 'codes installer: %s\n' "$1" >&2
  exit 1
}

for command in awk curl install mkdir mktemp rm tar uname; do
  command -v "$command" >/dev/null 2>&1 || fail "$command is required"
done

if [ -z "$version" ]; then
  latest_url=$(curl -fsSL -o /dev/null -w '%{url_effective}' \
    "https://github.com/$repository/releases/latest") ||
    fail 'could not resolve the latest release'
  version=${latest_url##*/}
fi

case "$version" in
  v*) ;;
  *) version="v$version" ;;
esac

case "$(uname -s)" in
  Darwin) platform='darwin' ;;
  Linux) platform='linux' ;;
  *) fail "unsupported operating system: $(uname -s)" ;;
esac

case "$(uname -m)" in
  arm64 | aarch64) architecture='arm64' ;;
  x86_64 | amd64) architecture='x64' ;;
  *) fail "unsupported architecture: $(uname -m)" ;;
esac

archive="codes-$version-$platform-$architecture.tar.gz"
download_url="https://github.com/$repository/releases/download/$version"
temporary_directory=$(mktemp -d)
cleanup() {
  rm -rf "$temporary_directory"
}
trap cleanup EXIT
trap 'exit 1' HUP INT TERM

printf 'Downloading Codes %s for %s-%s...\n' \
  "$version" "$platform" "$architecture"
curl -fsSL "$download_url/$archive" -o "$temporary_directory/$archive" ||
  fail "could not download $archive"
curl -fsSL "$download_url/SHA256SUMS" \
  -o "$temporary_directory/SHA256SUMS" ||
  fail 'could not download SHA256SUMS'

expected_checksum=$(
  awk -v archive="$archive" '$2 == archive { print $1 }' \
    "$temporary_directory/SHA256SUMS"
)
[ -n "$expected_checksum" ] || fail "SHA256SUMS has no entry for $archive"

if command -v sha256sum >/dev/null 2>&1; then
  actual_checksum=$(sha256sum "$temporary_directory/$archive" | awk '{ print $1 }')
elif command -v shasum >/dev/null 2>&1; then
  actual_checksum=$(shasum -a 256 "$temporary_directory/$archive" | awk '{ print $1 }')
else
  fail 'sha256sum or shasum is required'
fi

[ "$actual_checksum" = "$expected_checksum" ] || fail 'checksum verification failed'

tar -xzf "$temporary_directory/$archive" -C "$temporary_directory"
mkdir -p "$install_directory"
install -m 755 "$temporary_directory/codes" "$install_directory/codes"
"$install_directory/codes" --help >/dev/null

printf 'Installed Codes %s to %s/codes\n' "$version" "$install_directory"
case ":${PATH:-}:" in
  *:"$install_directory":*) ;;
  *)
    printf 'Add %s to PATH to run codes from any directory.\n' \
      "$install_directory"
    ;;
esac
