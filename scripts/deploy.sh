#!/usr/bin/env bash
# Brings this checkout's services up on the server: the pinned geodata, then the
# containers, rebuilt where their sources changed. The Deploy workflow runs it after
# every push to main, and the server repository's install after cloning or pulling.
set -euo pipefail
cd "$(dirname "$0")/.."

scripts/restore_geodata.sh
docker compose up --build -d
docker image prune -f > /dev/null  # the images this build replaced
