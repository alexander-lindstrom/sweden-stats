import VectorTileLayer from "ol/layer/VectorTile";
import MVT from "ol/format/MVT";
import VectorTileSource from "ol/source/VectorTile";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import Style from "ol/style/Style";
import type { FeatureLike } from "ol/Feature";
import { transformExtent } from "ol/proj";
import type { AdminLevel } from "@/datasets/types";

// Bounding box for Sweden in Web Mercator — tiles outside this are never requested.
const SWEDEN_EXTENT = transformExtent([10.0, 55.0, 25.0, 70.5], 'EPSG:4326', 'EPSG:3857');

export const baseVectorStyle = new Style({
  fill: new Fill({
    color: 'rgba(225, 218, 205, 0.8)',
  }),
  stroke: new Stroke({
    color: '#7898a8',
    width: 1.2,
  }),
});

// Highlight is a separate layer on top — just a bright border, no fill change needed.
const hoverHighlightStyle = new Style({
  fill: new Fill({ color: 'rgba(255, 255, 255, 0.12)' }),
  stroke: new Stroke({ color: 'rgba(255, 255, 255, 0.9)', width: 2.5 }),
});

const choroplethStroke = new Stroke({ color: '#8a9ea8', width: 0.7 });
const noDataStyle = new Style({
  fill: new Fill({ color: 'rgba(200, 193, 182, 0.9)' }),
  stroke: choroplethStroke,
});

export function createVectorTileSource(urlTemplate: string): VectorTileSource {
  return new VectorTileSource({
    format: new MVT(),
    url: urlTemplate,
    maxZoom: 14,
  });
}

export function createVectorTileLayer(
  source: VectorTileSource,
): VectorTileLayer {
  return new VectorTileLayer({
    source,
    extent: SWEDEN_EXTENT,
    declutter: true,
    visible: true,
    style: baseVectorStyle,
  });
}

export function createChoroplethLayer(
  source: VectorTileSource,
  styleFunction: (feature: FeatureLike) => Style,
): VectorTileLayer {
  return new VectorTileLayer({
    source,
    extent: SWEDEN_EXTENT,
    declutter: true,
    visible: true,
    style: styleFunction,
  });
}

/**
 * Lightweight layer sharing the same source as the main layer.
 * Only renders the hovered feature (returns null for everything else),
 * so OL skips non-hovered features entirely during re-render.
 * Call changed() on this instead of the main layer on hover changes.
 */
export function createHighlightLayer(
  source: VectorTileSource,
  codeProperty: string,
  hoveredCodeRef: { current: string | null },
): VectorTileLayer {
  return new VectorTileLayer({
    source,
    extent: SWEDEN_EXTENT,
    style: (feature: FeatureLike) => {
      const code = String(feature.get(codeProperty) ?? '');
      return code === hoveredCodeRef.current ? hoverHighlightStyle : undefined;
    },
  });
}

/**
 * Build a style function that colors features by category (e.g. winning party).
 * The colorFn receives the feature code and returns a CSS color string.
 */
export function buildCategoricalStyle(
  colorFn: (code: string) => string,
  codeProperty: string,
): (feature: FeatureLike) => Style {
  const styleCache = new Map<string, Style>();

  return (feature: FeatureLike): Style => {
    const code = String(feature.get(codeProperty) ?? '');
    const cached = styleCache.get(code);
    if (cached) { return cached; }

    const color = colorFn(code);
    const style = new Style({
      fill: new Fill({ color }),
      stroke: choroplethStroke,
    });
    styleCache.set(code, style);
    return style;
  };
}

export function buildChoroplethStyle(
  data: Record<string, number>,
  colorScale: (value: number) => string,
  codeProperty: string,
): (feature: FeatureLike) => Style {
  const styleCache = new Map<string, Style>();

  return (feature: FeatureLike): Style => {
    const code = String(feature.get(codeProperty) ?? '');

    const cached = styleCache.get(code);
    if (cached) {return cached;}

    const value = data[code];
    const style =
      value !== undefined
        ? new Style({
            fill: new Fill({ color: colorScale(value) }),
            stroke: choroplethStroke,
          })
        : noDataStyle;

    styleCache.set(code, style);
    return style;
  };
}

export const adminVectorTileLayers = {
  Country: {
    id: "country_mvt",
    url: "/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=ne:countries&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  },
  Region: {
    id: "region_mvt",
    url: "/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=sweden:lan&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  },
  Municipality: {
    id: "municipality_mvt",
    url: "/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=sweden:kommuner&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  },

  RegSO: {
    id: "regso_mvt",
    url: "/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=sweden:regso&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  },

  DeSO: {
    id: "deso_mvt",
    url: "/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=sweden:deso&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  }
};

// WFS layer names per admin level — used to fetch full feature geometry for true centroid.
export const adminWfsLayers: Record<AdminLevel, string> = {
  Country:      'ne:countries',
  Region:       'sweden:lan',
  Municipality: 'sweden:kommuner',
  RegSO:        'sweden:regso',
  DeSO:         'sweden:deso',
};

// Administrative hierarchy for sub-boundary rendering.
// Conceptual nesting is Region → Municipality → RegSO → DeSO, but the
// RegSO→DeSO sub-boundary preview is intentionally omitted: urban RegSO
// enclaves inside rural RegSOs make the overlay unreadably cluttered.
// DeSO is reached by switching level explicitly, not as a passive overlay.
export const SUB_LEVEL: Partial<Record<AdminLevel, AdminLevel>> = {
  Region:       'Municipality',
  Municipality: 'RegSO',
};

export const SUB_LEVEL_FILTER_PROP: Partial<Record<AdminLevel, string>> = {
  Region:       'county_code',
  Municipality: 'kommunkod',
};

// Code and label properties on sub-level features (mirrors FEATURE_CODE/LABEL_PROP in MapPage).
export const SUB_LEVEL_CODE_PROP: Partial<Record<AdminLevel, string>> = {
  Region:       'municipality_code',
  Municipality: 'regsokod',
};

export const SUB_LEVEL_LABEL_PROP: Partial<Record<AdminLevel, string>> = {
  Region:       'municipality_name',
  Municipality: 'regsonamn',
};

export function createSubBoundaryLayer(
  source: VectorTileSource,
  filterProp: string,
  parentCode: string,
): VectorTileLayer {
  const matchStyle = new Style({
    // Near-transparent fill makes the whole polygon interior hit-detectable.
    // Without it, forEachFeatureAtPixel only detects the stroke boundary pixels.
    fill: new Fill({ color: 'rgba(0, 0, 0, 0.01)' }),
    stroke: new Stroke({ color: 'rgba(50, 70, 90, 0.3)', width: 0.75 }),
  });
  return new VectorTileLayer({
    source,
    extent: SWEDEN_EXTENT,
    style: (feature: FeatureLike) =>
      String(feature.get(filterProp) ?? '') === parentCode ? matchStyle : undefined,
  });
}

export function createSelectionLayer(
  source: VectorTileSource,
  codeProperty: string,
  selectedCodeRef: { current: string | null },
): VectorTileLayer {
  const selectionStyle = new Style({
    stroke: new Stroke({ color: '#1e293b', width: 2.5 }),
  });
  return new VectorTileLayer({
    source,
    extent: SWEDEN_EXTENT,
    style: (feature: FeatureLike) => {
      const code = String(feature.get(codeProperty) ?? '');
      return code === selectedCodeRef.current ? selectionStyle : undefined;
    },
  });
}

export function createComparisonSelectionLayer(
  source: VectorTileSource,
  codeProperty: string,
  comparisonCodeRef: { current: string | null },
): VectorTileLayer {
  const comparisonStyle = new Style({
    stroke: new Stroke({ color: '#f97316', width: 2.5 }),
  });
  return new VectorTileLayer({
    source,
    extent: SWEDEN_EXTENT,
    style: (feature: FeatureLike) => {
      const code = String(feature.get(codeProperty) ?? '');
      return code === comparisonCodeRef.current ? comparisonStyle : undefined;
    },
  });
}
