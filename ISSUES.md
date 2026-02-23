# Open Issues

## #1 — Admin boundary layers not consistently clipped to land

**Layers affected:** DeSO, RegSO
**Current state:** Region and Municipality GeoPackages (from Lantmäteriet) are coastline-clipped. DeSO and RegSO from SCB are not — they extend into the sea.
**Desired state:** All four boundary levels clipped to land for visual consistency.

**Options investigated (priority order):**
1. WFS from SCB (`https://geodata.scb.se/geoserver/stat/wfs`) — DeSO_2025 and RegSO_2025 are available and CC0, but no pre-clipped variants exist
2. Download pre-clipped GeoPackages — check SCB for `_kl` variants
3. Clip manually using Python + GeoPandas with a Sweden land polygon

**Notes:** SCB WFS uses EPSG:3006 (SWEREF 99 TM) as default SRS — verify reprojection support before using as cascading WFS in GeoServer.
