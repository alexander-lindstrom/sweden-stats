#!/usr/bin/env bash
# Puts the GeoPackages pinned in data/geodata.lock into data/geopackage/, from the
# GitHub release geodata-<version>. Does nothing when that version is already there,
# so every deploy runs it. Run from anywhere; it works on the checkout it lives in.
#
# When files change under a running GeoServer, its tile cache for them is cleared
# and it is restarted, since cached tiles were cut from the old files.
set -euo pipefail
cd "$(dirname "$0")/.."

source data/geodata.lock  # GEODATA_VERSION, GEODATA_SHA256
dest=data/geopackage
marker=$dest/.geodata-version

if [[ -f $marker && $(<"$marker") == "$GEODATA_VERSION" ]]; then
  echo "geodata $GEODATA_VERSION already in place"
  exit 0
fi

# Staged next to the destination, so the files are moved in by rename.
stage=$(mktemp -d data/.geodata.XXXXXX)
trap 'rm -rf "$stage"' EXIT

base=${GEODATA_BASE_URL:-https://github.com/alexander-lindstrom/sweden-stats/releases/download}
echo "Fetching geodata $GEODATA_VERSION ..."
curl -fsSL -o "$stage/geodata.tar.gz" \
  "$base/geodata-$GEODATA_VERSION/geodata-$GEODATA_VERSION.tar.gz"
echo "$GEODATA_SHA256  $stage/geodata.tar.gz" | sha256sum -c --quiet
mkdir "$stage/files"
tar -xzf "$stage/geodata.tar.gz" -C "$stage/files"
(cd "$stage/files" && sha256sum -c --quiet SHA256SUMS)

mkdir -p "$dest"
for f in "$stage"/files/*.gpkg; do
  mv -f "$f" "$dest/"
  echo "  $dest/$(basename "$f")"
done
echo "$GEODATA_VERSION" > "$marker"

if docker compose ps --status running --services 2>/dev/null | grep -qx geoserver; then
  echo "Clearing GeoServer's tile cache and restarting it ..."
  docker compose exec -T geoserver sh -c \
    'cd /opt/geoserver/data_dir/gwc && for d in sweden_*; do [ -d "$d" ] && echo "  gwc/$d" && rm -rf "$d"; done; true'
  docker compose restart geoserver
fi
echo "geodata $GEODATA_VERSION restored"
