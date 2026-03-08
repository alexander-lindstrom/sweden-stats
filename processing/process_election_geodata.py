"""
process_election_geodata.py

Projects 2022 Swedish election results from valdistrikt boundaries onto
DeSO and RegSO boundaries using area-weighted spatial interpolation.

Inputs:
  data/valmyndigheten/valdistrikt/   — 21 GeoJSON zip files (one per län)
  data/valmyndigheten/valresultat/   — Excel files with vote counts per district
  data/geopackage/DeSO_2025_clipped.gpkg
  data/geopackage/RegSO_2025_clipped.gpkg

Outputs:
  data/elections/riksdag_2022_deso.json
  data/elections/riksdag_2022_regso.json
  data/elections/regionval_2022_deso.json
  data/elections/regionval_2022_regso.json
  data/elections/kommunval_2022_deso.json
  data/elections/kommunval_2022_regso.json

Each output is an ElectionDatasetResult-shaped JSON (partyVotes, winnerByGeo, labels).

The area-weighted interpolation assumes uniform voter distribution within each
valdistrikt — a reasonable approximation for revealing spatial patterns.
"""

import io
import json
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd

# ── Paths ─────────────────────────────────────────────────────────────────────

ROOT            = Path(__file__).parent.parent
VALDISTRIKT_DIR = ROOT / 'data' / 'valmyndigheten' / 'valdistrikt'
VALRESULTAT_DIR = ROOT / 'data' / 'valmyndigheten' / 'valresultat'
GEOPACKAGE_DIR  = ROOT / 'data' / 'geopackage'
OUT_DIR         = ROOT / 'data' / 'elections'

OUT_DIR.mkdir(exist_ok=True)

DESO_GPKG  = GEOPACKAGE_DIR / 'DeSO_2025_clipped.gpkg'
REGSO_GPKG = GEOPACKAGE_DIR / 'RegSO_2025_clipped.gpkg'

# ── Election result files ─────────────────────────────────────────────────────

ELECTION_FILES = {
    'riksdag': (
        'Roster-per-distrikt-slutligt-antal-roster-inklusive-totalt-valdeltagande-riksdagsvalet-2022 (2).xlsx',
        'roster_RD',
        'riksdag',
    ),
    'regionval': (
        'roster-per-distrikt-slutligt-antal-roster-inklusive-totalt-valdeltagande-regionval-2022.xlsx',
        'roster_RF',
        'region',
    ),
    'kommunval': (
        'roster-per-distrikt-slutligt-antal-roster-inklusive-totalt-valdeltagande-kommunval-2022.xlsx',
        'roster_KF',
        'municipality',
    ),
}

ELECTION_LABELS = {
    'riksdag':   'Riksdagsval',
    'regionval': 'Regionval',
    'kommunval': 'Kommunval',
}

# ── Party name → canonical code ───────────────────────────────────────────────
# All unlisted parties are folded into ÖVRIGA.

PARTY_MAP = {
    'Arbetarepartiet-Socialdemokraterna':  'S',
    'Moderaterna':                         'M',
    'Sverigedemokraterna':                 'SD',
    'Centerpartiet':                       'C',
    'Vänsterpartiet':                      'V',
    'Kristdemokraterna':                   'KD',
    'Miljöpartiet de gröna':               'MP',
    'Liberalerna (tidigare Folkpartiet)':  'L',
    'Liberalerna':                         'L',
}

# ── Load boundaries ───────────────────────────────────────────────────────────

def load_valdistrikt() -> gpd.GeoDataFrame:
    """Concatenate all 21 per-län GeoJSON zip files into one GeoDataFrame."""
    frames = []
    for zip_path in sorted(VALDISTRIKT_DIR.glob('*.zip')):
        with zipfile.ZipFile(zip_path) as z:
            json_name = next(n for n in z.namelist() if n.endswith('.json'))
            with z.open(json_name) as f:
                gdf = gpd.read_file(io.BytesIO(f.read()))
        # CRS is not embedded in the GeoJSON — assign SWEREF99TM explicitly.
        gdf = gdf.set_crs('EPSG:3006', allow_override=True)
        frames.append(gdf[['Lkfv', 'Vdnamn', 'geometry']])

    vd = gpd.GeoDataFrame(pd.concat(frames, ignore_index=True), crs='EPSG:3006')
    vd.geometry = vd.geometry.make_valid()
    print(f'  Loaded {len(vd)} valdistrikt from {len(frames)} läns')
    return vd


def load_deso() -> gpd.GeoDataFrame:
    gdf = gpd.read_file(DESO_GPKG, layer='DeSO_2025_clipped')
    gdf.geometry = gdf.geometry.make_valid()
    print(f'  Loaded {len(gdf)} DeSO areas')
    return gdf[['desokod', 'kommunkod', 'kommunnamn', 'geometry']]


def load_regso() -> gpd.GeoDataFrame:
    gdf = gpd.read_file(REGSO_GPKG, layer='RegSO_2025_clipped')
    gdf.geometry = gdf.geometry.make_valid()
    print(f'  Loaded {len(gdf)} RegSO areas')
    return gdf[['regsokod', 'regsonamn', 'kommunkod', 'geometry']]

# ── Spatial weight computation ────────────────────────────────────────────────

def compute_weights(
    valdistrikt: gpd.GeoDataFrame,
    reference:   gpd.GeoDataFrame,
    ref_code_col: str,
) -> pd.DataFrame:
    """
    Returns DataFrame [Lkfv, ref_code_col, weight] where
    weight = intersection_area / reference_area.

    Weights for a given ref area sum to ≤ 1 (may be < 1 near coast where
    the clipped reference geometry is smaller than the valdistrikt).
    """
    ref = reference.copy()
    ref['_ref_area'] = ref.geometry.area

    intersection = gpd.overlay(
        valdistrikt[['Lkfv', 'geometry']],
        ref[[ref_code_col, '_ref_area', 'geometry']],
        how='intersection',
        keep_geom_type=False,
    )
    intersection['weight'] = intersection.geometry.area / intersection['_ref_area']

    # Drop negligible slivers (< 0.01% of reference area) to keep output lean.
    intersection = intersection[intersection['weight'] > 0.0001]

    print(f'  {len(intersection)} intersection pairs for {ref_code_col}')
    return intersection[['Lkfv', ref_code_col, 'weight']].copy()

# ── Load and clean valresultat ────────────────────────────────────────────────

def load_votes(filename: str, sheet: str) -> pd.DataFrame:
    df = pd.read_excel(VALRESULTAT_DIR / filename, sheet_name=sheet)
    df.columns = df.columns.str.strip()

    # Derive 8-digit Lkfv join key from Distrikt (e.g. "RD-01-80-0100" → "01800100")
    df['Lkfv'] = (
        df['Distrikt']
        .str.replace(r'^[A-Z]+-', '', regex=True)
        .str.replace('-', '', regex=False)
    )

    # Uppsamlingsdistrikt have no geographic location — exclude them.
    df = df[df['Röstberättigade'] != 0].copy()

    df['Parti'] = df['Parti'].str.strip()

    # Exclude summary/statistic rows that are not parties.
    NON_PARTY_LABELS = {
        'Valdeltagande', 'Summa giltiga röster', 'Blanka röster',
        'Ogiltiga röster', 'Röstberättigade',
    }
    df = df[~df['Parti'].isin(NON_PARTY_LABELS)].copy()

    # Map the 8 main parties to canonical codes; keep the full name for all
    # others so we can apply a data-driven threshold later rather than losing
    # local party identity here.
    df['party_code'] = df['Parti'].map(PARTY_MAP).fillna(df['Parti'])

    votes = (
        df.groupby(['Lkfv', 'party_code'])['Röster']
        .sum()
        .reset_index()
    )

    n_districts = df['Lkfv'].nunique()
    n_local     = df[~df['Parti'].isin(PARTY_MAP)]['Parti'].nunique()
    print(f'  {n_districts} districts, {n_local} local/other parties (threshold applied later)')
    return votes

# ── Project votes onto reference boundary system ──────────────────────────────

# Parties that reach this share (%) in at least one area keep their own identity.
# Everything below is folded into ÖVRIGA. Keeps meaningful local parties visible
# while avoiding hundreds of near-zero entries for micro-parties.
LOCAL_PARTY_THRESHOLD = 0.5

MAIN_PARTIES = set(PARTY_MAP.values())  # {'S', 'M', 'SD', 'C', 'V', 'KD', 'MP', 'L'}


def project_votes(
    votes:         pd.DataFrame,
    weights:       pd.DataFrame,
    ref_code_col:  str,
    labels:        dict[str, str],
    label:         str,
    election_type: str,
) -> dict:
    merged = weights.merge(votes, on='Lkfv', how='inner')
    merged['weighted_votes'] = merged['weight'] * merged['Röster']

    agg = (
        merged
        .groupby([ref_code_col, 'party_code'])['weighted_votes']
        .sum()
        .reset_index()
    )

    totals       = agg.groupby(ref_code_col)['weighted_votes'].sum().rename('total')
    agg          = agg.join(totals, on=ref_code_col)
    agg          = agg[agg['total'] > 0].copy()
    agg['share'] = agg['weighted_votes'] / agg['total'] * 100

    # Determine which local (non-main) parties clear the threshold in any area.
    local_mask    = ~agg['party_code'].isin(MAIN_PARTIES)
    local_max     = agg[local_mask].groupby('party_code')['share'].max()
    keep_local    = set(local_max[local_max >= LOCAL_PARTY_THRESHOLD].index)
    fold_to_ovriga = set(local_max[local_max < LOCAL_PARTY_THRESHOLD].index)

    agg['party_code'] = agg['party_code'].where(
        agg['party_code'].isin(MAIN_PARTIES) | agg['party_code'].isin(keep_local),
        other='ÖVRIGA',
    )

    # Re-aggregate after folding sub-threshold parties into ÖVRIGA.
    agg    = agg.groupby([ref_code_col, 'party_code'])['weighted_votes'].sum().reset_index()
    totals = agg.groupby(ref_code_col)['weighted_votes'].sum().rename('total')
    agg    = agg.join(totals, on=ref_code_col)
    agg['share'] = (agg['weighted_votes'] / agg['total'] * 100).round(1)

    party_votes: dict[str, dict[str, float]] = {}
    for code, group in agg.groupby(ref_code_col):
        party_votes[code] = dict(zip(group['party_code'], group['share']))

    winner_by_geo = {
        code: max(shares, key=shares.get)
        for code, shares in party_votes.items()
    }

    result_labels = {code: labels.get(code, code) for code in party_votes}

    print(f'  {len(party_votes)} areas | {len(keep_local)} local parties kept, {len(fold_to_ovriga)} folded into OVRIGA')
    return {
        'partyVotes':   party_votes,
        'winnerByGeo':  winner_by_geo,
        'labels':       result_labels,
        'label':        label,
        'unit':         '%',
        'electionType': election_type,
        'year':         2022,
    }

# ── Main ──────────────────────────────────────────────────────────────────────

def main() -> None:
    print('Loading boundaries...')
    valdistrikt = load_valdistrikt()
    deso        = load_deso()
    regso       = load_regso()

    # Label dicts — DeSO has no name column so use kommunnamn + code.
    deso_labels  = {row.desokod:  f'{row.kommunnamn} ({row.desokod})' for row in deso.itertuples()}
    regso_labels = {row.regsokod: row.regsonamn                        for row in regso.itertuples()}

    # Compute spatial weights — expensive, done once and reused across election types.
    print('\nComputing spatial weights (this may take a few minutes)...')
    deso_weights  = compute_weights(valdistrikt, deso,  'desokod')
    regso_weights = compute_weights(valdistrikt, regso, 'regsokod')

    # Process each election type.
    for election_id, (filename, sheet, election_type) in ELECTION_FILES.items():
        print(f'\nProcessing {election_id}...')
        votes = load_votes(filename, sheet)
        label = ELECTION_LABELS[election_id]

        for ref_code_col, weights, labels, suffix in [
            ('desokod',  deso_weights,  deso_labels,  'deso'),
            ('regsokod', regso_weights, regso_labels, 'regso'),
        ]:
            print(f'  -> {suffix.upper()}')
            result   = project_votes(votes, weights, ref_code_col, labels, label, election_type)
            out_path = OUT_DIR / f'{election_id}_2022_{suffix}.json'
            out_path.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
            print(f'     Written {out_path.name} ({out_path.stat().st_size // 1024} KB)')

    print('\nDone.')


if __name__ == '__main__':
    main()
