#!/usr/bin/env bash
# Packs what processing/build_geodata.py wrote to data/geopackage into
# dist/geodata-<version>.tar.gz, the asset of the GitHub release geodata-<version>,
# and prints the data/geodata.lock that pins it.
#
#   processing/pack_geodata.sh 2025.1
set -euo pipefail

version=${1:?usage: pack_geodata.sh <version>}
[[ $version =~ ^[0-9]{4}\.[0-9]+$ ]] || { echo "version must look like 2025.1" >&2; exit 1; }
cd "$(dirname "$0")/.."

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cp data/geopackage/*.gpkg data/geopackage/MANIFEST.json "$work"/
(cd "$work" && sha256sum -- *.gpkg > SHA256SUMS)

mkdir -p dist
out=dist/geodata-$version.tar.gz
# Fixed order, times and owners, so the same files always give the same archive.
tar --sort=name --mtime=@0 --owner=0 --group=0 --numeric-owner -C "$work" -cf - . | gzip -n > "$out"

echo "$out"
echo
echo "data/geodata.lock:"
printf 'GEODATA_VERSION=%s\nGEODATA_SHA256=%s\n' "$version" "$(sha256sum "$out" | cut -d' ' -f1)"
