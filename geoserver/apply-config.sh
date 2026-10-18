# Puts GeoServer's catalog from this repository (geoserver/data_dir) into its data
# directory at every start, replacing what is there: the `sweden` workspace with its
# GeoPackage stores and layers, the default styles those layers refer to by id, and the
# tile-cache settings that turn on vector tiles. GeoServer and the image generate the
# rest of the data directory, and the image the admin login, themselves.
#
# The image's start script sources this from /docker-entrypoint-geoserver.d/ as root,
# just before GeoServer starts, as `. file || true`. That disables `set -e` in here, so
# every step checks for failure itself; a failure exits the start script, so the
# container stops instead of serving no layers.
apply_config() {
  local src=/opt/geoserver-config dst=${GEOSERVER_DATA_DIR:?} sum path name
  # The catalog and the GeoPackages' version (GEODATA_VERSION, from data/geodata.lock)
  sum=$( (cd "$src" && find . -type f -print0 | sort -z | xargs -0 sha256sum &&
    echo "geodata ${GEODATA_VERSION:-}") | sha256sum) || return 1
  sum=${sum%% *}

  # Tiles cut with an older catalog or from older GeoPackages are stale; GeoWebCache
  # keeps them per layer.
  if [[ ! -f $dst/.config-sha256 || $(<"$dst/.config-sha256") != "$sum" ]]; then
    rm -rf "${GEOWEBCACHE_CACHE_DIR:-$dst/gwc}"/sweden_* || return 1
  fi

  for path in "$src"/*; do
    name=$(basename "$path")
    rm -rf "${dst:?}/$name" && cp -R "$path" "$dst/" &&
      chown -R "${GEOSERVER_UID:-1000}:${GEOSERVER_GID:-1000}" "$dst/$name" || return 1
  done
  echo "$sum" > "$dst/.config-sha256" || return 1
  echo "apply-config.sh: catalog ${sum:0:12} in place"
}

if ! apply_config; then
  echo "apply-config.sh: could not put the GeoServer catalog in place" >&2
  exit 1
fi
unset -f apply_config
