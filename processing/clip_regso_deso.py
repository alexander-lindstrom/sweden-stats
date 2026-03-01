"""
Build a consistent set of GeoPackages for all four boundary levels from SCB sources.

Approach: RegSO is clipped to land first, then Kommuner and Lan are derived by
dissolving the clipped RegSO. This guarantees that all boundary levels share
exactly the same edges — no gaps or overlaps between layers.

No pre-simplification is applied. GeoServer already simplifies geometries when
generating MVT tiles at each zoom level, so pre-simplifying the source data is
redundant and breaks topology between layers.

Inputs (data/SCB boundaries/):
  - Kommun_Sweref99TM.zip   -- SCB municipality boundaries (used for land mask)
  - LanSweref99TM.zip       -- SCB county (lan) boundaries (used for names only)
  - RegSO_2025.gpkg         -- SCB RegSO boundaries (base geometry for all levels)
  - DeSO_2025.gpkg          -- SCB DeSO boundaries

Processing:
  1. Dissolve SCB Kommuner -> land mask
  2. Clip RegSO to land mask
  3. Dissolve clipped RegSO by kommunkod -> Kommuner
  4. Dissolve clipped RegSO by lanskod  -> Lan  (names joined from SCB Lan file)
  5. Clip DeSO to land mask

Outputs (data/geopackage/):
  - RegSO_2025_clipped.gpkg
  - DeSO_2025_clipped.gpkg
  - sveriges_kommuner_sf_simple.gpkg
  - sveriges_lan_sf_simple.gpkg

Usage:
  cd processing
  python clip_regso_deso.py
"""

import geopandas as gpd
from pathlib import Path

SCB_DIR     = Path(__file__).parent.parent / "data" / "SCB boundaries"
OUT_DIR     = Path(__file__).parent.parent / "data" / "geopackage"
CRS         = "EPSG:3006"

# Drop polygon fragments smaller than this after clipping (m2).
MIN_AREA_M2 = 5_000


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def clip(
    gdf: gpd.GeoDataFrame,
    land: gpd.GeoDataFrame,
    label: str,
) -> gpd.GeoDataFrame:
    print(f"  Clipping {label} ({len(gdf)} features) ...")
    clipped = gdf.clip(land)
    clipped = clipped[~clipped.geometry.is_empty & clipped.geometry.notna()]
    clipped = clipped[clipped.geometry.area >= MIN_AREA_M2].copy()
    print(f"  {len(clipped)} features after clip (dropped {len(gdf) - len(clipped)})")
    return clipped


def save(gdf: gpd.GeoDataFrame, filename: str, layer: str) -> None:
    path = OUT_DIR / filename
    gdf.to_file(path, driver="GPKG", layer=layer)
    print(f"  Saved: {path} (layer='{layer}')")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    # -- Land mask -----------------------------------------------------------
    print("Loading SCB Kommuner for land mask ...")
    kommuner_raw = gpd.read_file(SCB_DIR / "Kommun_Sweref99TM.zip")
    kommuner_raw = kommuner_raw.set_crs(CRS, allow_override=True)
    land = kommuner_raw.dissolve()
    print(f"  Land mask ready ({len(kommuner_raw)} municipalities dissolved)")

    # -- RegSO: clip (base for all higher levels) ----------------------------
    print("\nBuilding RegSO ...")
    regso_raw = gpd.read_file(SCB_DIR / "RegSO_2025.gpkg")
    regso = clip(regso_raw, land, "RegSO")
    save(regso, "RegSO_2025_clipped.gpkg", "RegSO_2025")

    # -- DeSO: clip ----------------------------------------------------------
    print("\nBuilding DeSO ...")
    deso_raw = gpd.read_file(SCB_DIR / "DeSO_2025.gpkg")
    deso = clip(deso_raw, land, "DeSO")
    save(deso, "DeSO_2025_clipped.gpkg", "DeSO_2025")

    # -- Kommuner: dissolve RegSO by kommunkod --------------------------------
    # All RegSO features with the same kommunkod share the same kommunnamn,
    # so aggfunc='first' is safe for the name column.
    print("\nDeriving Kommuner from simplified RegSO ...")
    kommuner = (
        regso
        .dissolve(by="kommunkod", aggfunc={"kommunnamn": "first"})
        .reset_index()
        .rename(columns={"kommunkod": "municipality_code", "kommunnamn": "municipality_name"})
    )
    kommuner["county_code"] = kommuner["municipality_code"].str[:2]
    kommuner = kommuner[["municipality_code", "municipality_name", "county_code", "geometry"]]
    save(kommuner, "sveriges_kommuner_sf_simple.gpkg", "sveriges_kommuner_sf_simple")

    # -- Lan: dissolve RegSO by lanskod, join names from SCB Lan file --------
    print("\nDeriving Lan from simplified RegSO ...")
    lan_names = (
        gpd.read_file(SCB_DIR / "LanSweref99TM.zip")
        .rename(columns={"LnKod": "county_code", "LnNamn": "county_name"})
        [["county_code", "county_name"]]
    )
    lan = (
        regso
        .dissolve(by="lanskod")
        .reset_index()
        [["lanskod", "geometry"]]
        .rename(columns={"lanskod": "county_code"})
        .merge(lan_names, on="county_code")
    )
    lan = gpd.GeoDataFrame(lan[["county_code", "county_name", "geometry"]], crs=CRS)
    save(lan, "sveriges_lan_sf_simple.gpkg", "sveriges_lan_sf_simple")

    print("\nDone.")


if __name__ == "__main__":
    main()
