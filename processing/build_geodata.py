"""
Build every GeoPackage GeoServer serves, from scratch, into data/geopackage/.

Steps:
  1. Download SCB DeSO 2025 and RegSO 2025 from SCB's WFS and check their content
     against the fingerprints recorded below. A source that has changed stops the
     build: review the change, then update its fingerprint here.
  2. Bring the SCB layers to the schema clip_regso_deso.py expects (the WFS has no
     kommunnamn, so it is joined from the SCB kommun file) and run that script.
  3. Write MANIFEST.json: feature counts and source fingerprints.

Usage (from the repository root):
  pip install -r processing/requirements.txt
  python processing/build_geodata.py

Package the result for a release with processing/pack_geodata.sh.
"""

import hashlib
import json
import sys
import urllib.request
from pathlib import Path

import geopandas as gpd
import pyogrio
import shapely

sys.path.insert(0, str(Path(__file__).parent))
import clip_regso_deso  # noqa: E402

ROOT    = Path(__file__).parent.parent
SCB_DIR = ROOT / "data" / "SCB boundaries"
OUT_DIR = ROOT / "data" / "geopackage"

SCB_WFS = (
    "https://geodata.scb.se/geoserver/stat/wfs?service=WFS&REQUEST=GetFeature"
    "&version=1.1.0&outputFormat=geopackage&TYPENAMES=stat:"
)

# SCB generates the GeoPackage per request, so its bytes differ between downloads.
# These fingerprints hash the content instead (see fingerprint()).
SCB_SOURCES = {
    "DeSO_2025":  "45f2a271b147e10d",
    "RegSO_2025": "47905a5eb28f7bf8",
}

# Field order of the published layers, as GeoServer was set up with them.
DESO_FIELDS  = ["objectid", "objektidentitet", "desokod", "regsokod", "lanskod",
                "kommunkod", "kommunnamn", "version"]
REGSO_FIELDS = ["objectid", "objektidentitet", "regsokod", "regsonamn", "lanskod",
                "kommunkod", "kommunnamn", "version"]


def download(url: str, path: Path) -> None:
    print(f"  Downloading {path.name} ...")
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".part")
    with urllib.request.urlopen(url, timeout=300) as response, open(tmp, "wb") as f:
        while chunk := response.read(1 << 20):
            f.write(chunk)
    tmp.replace(path)


def fingerprint(path: Path) -> str:
    """Hash of the features, sorted, attributes and geometry: stable across downloads."""
    gdf = gpd.read_file(path)
    attrs = [c for c in gdf.columns if c != "geometry"]
    gdf = gdf.sort_values(attrs).reset_index(drop=True)
    h = hashlib.sha256()
    h.update(gdf[attrs].to_csv(index=False).encode())
    for wkb in shapely.to_wkb(gdf.geometry.values, output_dimension=2, byte_order=1):
        h.update(wkb)
    return h.hexdigest()[:16]


def fetch_scb(layer: str, expected: str) -> Path:
    path = SCB_DIR / f"{layer}.source.gpkg"
    download(SCB_WFS + layer, path)
    actual = fingerprint(path)
    if actual != expected:
        sys.exit(f"{layer}: content fingerprint {actual}, expected {expected}. "
                 "SCB has changed the source; review it, then update SCB_SOURCES.")
    return path


def normalize(source: Path, layer: str, fields: list[str], kommun_names: dict) -> None:
    """Write data/SCB boundaries/<layer>.gpkg in the schema clip_regso_deso.py reads."""
    gdf = gpd.read_file(source)
    gdf["kommunnamn"] = gdf["kommunkod"].map(kommun_names)
    unnamed = gdf.loc[gdf["kommunnamn"].isna(), "kommunkod"].unique()
    if len(unnamed):
        sys.exit(f"{layer}: no name in the kommun file for {sorted(unnamed)}")
    gdf = gdf[fields + ["geometry"]]
    path = SCB_DIR / f"{layer}.gpkg"
    path.unlink(missing_ok=True)
    gdf.to_file(path, driver="GPKG", layer=layer)


def main() -> None:
    print("Fetching sources ...")
    sources = {layer: fetch_scb(layer, fp) for layer, fp in SCB_SOURCES.items()}

    kommuner = gpd.read_file(SCB_DIR / "Kommun_Sweref99TM.zip")
    kommun_names = dict(zip(kommuner["KnKod"], kommuner["KnNamn"]))
    normalize(sources["DeSO_2025"], "DeSO_2025", DESO_FIELDS, kommun_names)
    normalize(sources["RegSO_2025"], "RegSO_2025", REGSO_FIELDS, kommun_names)

    print()
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    clip_regso_deso.main()

    manifest = {
        "sources": SCB_SOURCES,
        "features": {p.name: pyogrio.read_info(p)["features"]
                     for p in sorted(OUT_DIR.glob("*.gpkg"))},
        "libraries": {"geopandas": gpd.__version__, "shapely": shapely.__version__,
                      "gdal": pyogrio.__gdal_version_string__},
    }
    (OUT_DIR / "MANIFEST.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest["features"], indent=2))


if __name__ == "__main__":
    main()
