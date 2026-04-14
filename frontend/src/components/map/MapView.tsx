import React, { useCallback, useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import { defaults as defaultControls } from "ol/control";
import TileLayer from "ol/layer/Tile";
import DoubleClickZoom from "ol/interaction/DoubleClickZoom";
import XYZ from "ol/source/XYZ";
import { fromLonLat } from "ol/proj";
import GeoJSON from "ol/format/GeoJSON";
import VectorTileSource from "ol/source/VectorTile";
import "ol/ol.css";

import { BaseMapKey, baseMaps } from "./BaseMaps";
import {
  adminVectorTileLayers,
  adminWfsLayers,
  baseFillStyle,
  buildCategoricalStyle,
  buildChoroplethStyle,
  buildFilteredChoroplethStyle,
  buildFilterStyle,
  createBoundaryLayer,
  createComparisonSelectionLayer,
  createHighlightLayer,
  createSelectionLayer,
  createSubBoundaryLayer,
  createVectorTileLayer,
  createVectorTileSource,
  SUB_LEVEL,
  SUB_LEVEL_CODE_PROP,
  SUB_LEVEL_FILTER_PROP,
  SUB_LEVEL_LABEL_PROP,
} from "./VectorTiles";
import VectorTileLayer from "ol/layer/VectorTile";
import { MapBrowserEvent } from "ol";
import { AdminLevel } from "@/datasets/types";
import { Tooltip } from "@/components/ui/Tooltip";
import { cleanCountyLabel } from "@/utils/labelFormatting";

// Maximum zoom applied when fitting a feature's extent into view.
// Prevents tiny features (a small DeSO) from zooming in absurdly close.
const LEVEL_MAX_ZOOM: Record<AdminLevel, number> = {
  Country:      7,
  Region:       9,
  Municipality: 13,
  RegSO:        15,
  DeSO:         16,
};

const SWEDEN_CENTER = fromLonLat([15.0, 63.0]);

interface HoveredFeature {
  label:   string;
  value:   number | null;
  tooltip: string | null; // pre-formatted string (used for categorical data like elections)
}

export interface MapViewProps {
  adminLevel: AdminLevel;
  selectedBase: BaseMapKey;
  choroplethData: Record<string, number> | null;
  colorScale: ((value: number) => string) | null;
  /** When set, overrides colorScale — colors features by category (e.g. election winner). */
  mapColorFn?: ((code: string) => string) | null;
  /** Pre-formatted tooltip strings keyed by geo code. Overrides the numeric choropleth display. */
  tooltipData?: Record<string, string> | null;
  /** Display name overrides keyed by geo code. Supplements missing or raw GeoServer labels. */
  featureLabels?: Record<string, string> | null;
  featureCodeProperty: string;
  featureLabelProperty: string;
  featureParentProperty?: string;
  unit: string;
  /** Values keyed by sub-level codes (e.g. municipality codes when adminLevel=Region).
   *  Used to show data values when hovering sub-boundary features. */
  subChoroplethData?: Record<string, number> | null;
  /** Pre-formatted tooltip strings for sub-level features (used for categorical data like elections).
   *  Takes precedence over subChoroplethData when present. */
  subTooltipData?: Record<string, string> | null;
  selectedFeature: { code: string; label: string; parentCode?: string } | null;
  onFeatureSelect: (f: { code: string; label: string; parentCode?: string } | null) => void;
  onDrillDown: (level: AdminLevel, code: string, label: string, parentCode?: string) => void;
  /** Second selected area for comparison mode. Shift-click to set. */
  comparisonFeature?: { code: string; label: string; parentCode?: string } | null;
  onComparisonSelect?: (f: { code: string; label: string; parentCode?: string } | null) => void;
  /** When set, switches map to binary filter mode: matching areas highlighted, rest greyed out. */
  matchingAreas?: Set<string> | null;
  /** Increment to trigger an animated reset of the map view to the initial Sweden overview. */
  resetToken?: number;
  /** Opacity of the data fill layer (0–1). The boundary layer is always fully opaque. */
  fillOpacity?: number;
}

// Module-level helper — fit the OL view to a WFS feature's extent.
// Uses 22% padding on each side (relative to the map viewport) so features
// are shown with generous context. maxZoom guards against absurdly close zoom
// on tiny features (small DeSO areas etc.).
function zoomToWfsFeature(
  view: View,
  map: Map,
  wfsTypeName: string,
  codeProperty: string,
  code: string,
  maxZoom: number,
  signal?: AbortSignal,
): void {
  const params = new URLSearchParams({
    service:      'WFS',
    version:      '2.0.0',
    request:      'GetFeature',
    typeNames:    wfsTypeName,
    CQL_FILTER:   `${codeProperty}='${code}'`,
    outputFormat: 'application/json',
    srsName:      'EPSG:3857',
    count:        '1',
  });
  fetch(`/geoserver/wfs?${params}`, { signal })
    .then(r => r.json())
    .then(geojson => {
      if (geojson.features?.length > 0) {
        const features = new GeoJSON().readFeatures(geojson);
        const extent   = features[0].getGeometry()?.getExtent();
        if (extent) {
          const size = map.getSize() ?? [800, 600];
          const padH = Math.round(size[0] * 0.22);
          const padV = Math.round(size[1] * 0.22);
          view.fit(extent, { padding: [padV, padH, padV, padH], maxZoom, duration: 800 });
        }
      }
    })
    .catch(() => { /* WFS failed — leave map as-is */ });
}

const MapView: React.FC<MapViewProps> = ({
  adminLevel,
  selectedBase,
  choroplethData,
  colorScale,
  mapColorFn,
  tooltipData,
  featureLabels,
  featureCodeProperty,
  featureLabelProperty,
  featureParentProperty,
  unit,
  subChoroplethData,
  subTooltipData,
  selectedFeature,
  onFeatureSelect,
  onDrillDown,
  comparisonFeature,
  onComparisonSelect,
  matchingAreas,
  resetToken,
  fillOpacity = 1,
}) => {
  const mapRef           = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef   = useRef<Map | null>(null);
  const baseLayerRef     = useRef<TileLayer<XYZ>>(
    new TileLayer({ visible: false })
  );
  const fillLayerRef     = useRef<VectorTileLayer | null>(null);
  const boundaryLayerRef = useRef<VectorTileLayer | null>(null);
  // Outgoing layers are kept visible during level transitions until the first
  // tile from the incoming source fires, then discarded.
  const outgoingFillLayerRef     = useRef<VectorTileLayer | null>(null);
  const outgoingBoundaryLayerRef = useRef<VectorTileLayer | null>(null);
  // Separate lightweight layer for hover highlight — shares the same source as
  // fillLayerRef so no extra tile fetches. Only re-renders this layer on
  // hover changes instead of the full (expensive) choropleth layer.
  const highlightLayerRef = useRef<VectorTileLayer | null>(null);
  const hoveredCodeRef    = useRef<string | null>(null);
  const sourceRef            = useRef<VectorTileSource | null>(null);
  const selectedCodeRef      = useRef<string | null>(null);
  const subLayerRef          = useRef<VectorTileLayer | null>(null);
  const subHighlightLayerRef = useRef<VectorTileLayer | null>(null);
  const selectionLayerRef          = useRef<VectorTileLayer | null>(null);
  const comparisonCodeRef          = useRef<string | null>(null);
  const comparisonSelectionLayerRef = useRef<VectorTileLayer | null>(null);
  const hoveredSubCodeRef          = useRef<string | null>(null);

  // Keep latest prop refs so effects/callbacks always see current values
  // without needing them in dependency arrays.
  const subChoroplethDataRef = useRef(subChoroplethData);
  subChoroplethDataRef.current = subChoroplethData;
  const subTooltipDataRef = useRef(subTooltipData);
  subTooltipDataRef.current = subTooltipData;
  const fillOpacityRef = useRef(fillOpacity);
  fillOpacityRef.current = fillOpacity;

  // Hit-test throttle refs (50 ms ≈ 20/s)
  const throttleRef  = useRef<number | null>(null);
  const lastPixelRef = useRef<[number, number] | null>(null);

  // Tooltip DOM ref — position is updated directly, bypassing React
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const [hoveredFeature, setHoveredFeature] = useState<HoveredFeature | null>(null);

  // --- Click handler --------------------------------------------------------
  // Priority 1: sub-boundary layer (drill down into selected feature's children)
  // Priority 2: main overlay layer (select / re-select)
  // No hit: deselect
  const handleMapClick = useCallback((evt: MapBrowserEvent) => {
    const map = mapInstanceRef.current;
    if (!map) {return;}

    // -- Priority 1: sub-layer --
    const subLayer = subLayerRef.current;
    if (subLayer && selectedCodeRef.current) {
      const subLevel    = SUB_LEVEL[adminLevel];
      const subCodeProp = SUB_LEVEL_CODE_PROP[adminLevel];
      const filterProp  = SUB_LEVEL_FILTER_PROP[adminLevel];

      if (subLevel && subCodeProp && filterProp) {
        let hitSub = false;

        map.forEachFeatureAtPixel(
          evt.pixel,
          (feature) => {
            // Only accept features that belong to the selected parent.
            if (String(feature.get(filterProp) ?? '') !== selectedCodeRef.current) {return;}
            hitSub = true;
            return true;
          },
          { layerFilter: (l) => l === subLayer, hitTolerance: 5 },
        );

        if (hitSub) {
          // Single click on a sub-boundary does nothing; double-click drills down.
          return;
        }
      }
    }

    // -- Priority 2: main overlay layer --
    let clickedCode: string | null = null;
    let clickedLabel: string | null = null;
    let clickedParentCode: string | undefined = undefined;

    map.forEachFeatureAtPixel(
      evt.pixel,
      (feature) => {
        clickedCode  = String(feature.get(featureCodeProperty) ?? '');
        const rawClickLabel = featureLabels?.[clickedCode] ?? String(feature.get(featureLabelProperty) ?? clickedCode);
        clickedLabel = adminLevel === 'Region' ? cleanCountyLabel(rawClickLabel) : rawClickLabel;
        if (featureParentProperty) {
          const p = feature.get(featureParentProperty);
          if (p) { clickedParentCode = String(p); }
        }
        return true;
      },
      { layerFilter: (layer) => layer === fillLayerRef.current, hitTolerance: 5 },
    );

    const isShift = (evt.originalEvent as MouseEvent).shiftKey;

    if (!clickedCode) {
      if (isShift) {
        onComparisonSelect?.(null);
      } else {
        onFeatureSelect(null); // empty-space click → deselect
      }
      return;
    }

    if (isShift) {
      onComparisonSelect?.({ code: clickedCode, label: clickedLabel ?? clickedCode, parentCode: clickedParentCode });
    } else {
      onFeatureSelect({ code: clickedCode, label: clickedLabel ?? clickedCode, parentCode: clickedParentCode });
    }
  }, [adminLevel, featureCodeProperty, featureLabelProperty, featureParentProperty, featureLabels, onFeatureSelect, onComparisonSelect]);

  // --- Double-click handler: drill down into sub-boundary -------------------
  const handleMapDblClick = useCallback((evt: MapBrowserEvent) => {
    const map = mapInstanceRef.current;
    if (!map) { return; }

    const subLayer = subLayerRef.current;
    if (!subLayer || !selectedCodeRef.current) { return; }

    const subLevel     = SUB_LEVEL[adminLevel];
    const subCodeProp  = SUB_LEVEL_CODE_PROP[adminLevel];
    const subLabelProp = SUB_LEVEL_LABEL_PROP[adminLevel];
    const filterProp   = SUB_LEVEL_FILTER_PROP[adminLevel];
    if (!subLevel || !subCodeProp || !subLabelProp || !filterProp) { return; }

    let subCode: string | null  = null;
    let subLabel: string | null = null;

    map.forEachFeatureAtPixel(
      evt.pixel,
      (feature) => {
        if (String(feature.get(filterProp) ?? '') !== selectedCodeRef.current) { return; }
        subCode  = String(feature.get(subCodeProp) ?? '');
        subLabel = String(feature.get(subLabelProp) ?? subCode);
        return true;
      },
      { layerFilter: (l) => l === subLayer, hitTolerance: 5 },
    );

    if (subCode) {
      onDrillDown(subLevel, subCode, subLabel ?? subCode, selectedCodeRef.current ?? undefined);
    }
  }, [adminLevel, onDrillDown]);

  // --- Pointer-move handler: hover tooltip + highlight ----------------------
  // Defined as a useCallback so the registration effect stays a clean 3-liner.
  // Deps mirror the pointermove effect below — the handler re-creates (and the
  // effect re-binds) only when the values it reads from props change.
  const handlePointerMove = useCallback((evt: MapBrowserEvent) => {
    const map = mapInstanceRef.current;
    if (!map) { return; }

    if (evt.dragging) {
      if (throttleRef.current !== null) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
      if (hoveredCodeRef.current !== null) {
        hoveredCodeRef.current = null;
        highlightLayerRef.current?.changed();
      }
      if (hoveredSubCodeRef.current !== null) {
        hoveredSubCodeRef.current = null;
        subHighlightLayerRef.current?.changed();
      }
      setHoveredFeature(null);
      mapRef.current!.style.cursor = '';
      return;
    }

    // Update tooltip position immediately — cheap direct DOM, no React re-render
    lastPixelRef.current = evt.pixel as [number, number];
    if (tooltipRef.current) {
      tooltipRef.current.style.left = `${evt.pixel[0] + 14}px`;
      tooltipRef.current.style.top  = `${evt.pixel[1] + 14}px`;
    }

    // Throttle expensive hit detection to ~20/s
    if (throttleRef.current !== null) { return; }
    throttleRef.current = window.setTimeout(() => {
      throttleRef.current = null;
      const pixel = lastPixelRef.current;
      if (!pixel) { return; }

      // -- Priority 1: sub-layer (when a feature is selected) --
      const subLayer = subLayerRef.current;
      if (subLayer && selectedCodeRef.current) {
        const subCodeProp  = SUB_LEVEL_CODE_PROP[adminLevel];
        const subLabelProp = SUB_LEVEL_LABEL_PROP[adminLevel];
        const filterProp   = SUB_LEVEL_FILTER_PROP[adminLevel];

        if (subCodeProp && subLabelProp && filterProp) {
          let subCode: string | null = null;
          let subLabel: string | null = null;

          map.forEachFeatureAtPixel(
            pixel,
            (feature) => {
              if (String(feature.get(filterProp) ?? '') !== selectedCodeRef.current) { return; }
              subCode  = String(feature.get(subCodeProp) ?? '');
              subLabel = String(feature.get(subLabelProp) ?? subCode);
              return true;
            },
            { layerFilter: (l) => l === subLayer, hitTolerance: 3 },
          );

          if (subCode) {
            if (subCode !== hoveredSubCodeRef.current) {
              hoveredSubCodeRef.current = subCode;
              subHighlightLayerRef.current?.changed();
              const subTip = subTooltipDataRef.current?.[subCode] ?? null;
              setHoveredFeature({
                label:   subLabel!,
                value:   subTip !== null ? null : (subChoroplethDataRef.current?.[subCode] ?? null),
                tooltip: subTip,
              });
            }
            // Clear main highlight while hovering a sub-feature.
            if (hoveredCodeRef.current !== null) {
              hoveredCodeRef.current = null;
              highlightLayerRef.current?.changed();
            }
            mapRef.current!.style.cursor = 'pointer';
            return;
          }
        }
      }

      // Leaving sub-layer territory — clear sub highlight.
      if (hoveredSubCodeRef.current !== null) {
        hoveredSubCodeRef.current = null;
        subHighlightLayerRef.current?.changed();
      }

      // -- Priority 2: main overlay layer --
      let result: { code: string; label: string; value: number | null; tooltip: string | null } | null = null;

      map.forEachFeatureAtPixel(
        pixel,
        (feature) => {
          const code     = String(feature.get(featureCodeProperty) ?? '');
          const rawLabel = featureLabels?.[code] ?? String(feature.get(featureLabelProperty) ?? code);
          const label    = adminLevel === 'Region' ? cleanCountyLabel(rawLabel) : rawLabel;
          // tooltipData overrides numeric choropleth for election/categorical data.
          // When tooltipData is provided but has no entry for this code, the area has
          // no data (e.g. Gotland in regionval) — show "Ingen data" explicitly.
          const value    = choroplethData?.[code] ?? null;
          const tooltip  = tooltipData != null ? (tooltipData[code] ?? 'Ingen data') : null;
          result = { code, label, value: tooltip !== null ? null : value, tooltip };
          return true;
        },
        { layerFilter: (l) => l === fillLayerRef.current, hitTolerance: 3 },
      );

      if (result !== null) {
        const { code, label, value, tooltip } = result;
        if (code !== hoveredCodeRef.current) {
          hoveredCodeRef.current = code;
          // Only re-render the thin highlight layer, not the full choropleth layer
          highlightLayerRef.current?.changed();
          setHoveredFeature({ label, value, tooltip });
        }
        mapRef.current!.style.cursor = 'pointer';
      } else {
        if (hoveredCodeRef.current !== null) {
          hoveredCodeRef.current = null;
          highlightLayerRef.current?.changed();
          setHoveredFeature(null);
        }
        mapRef.current!.style.cursor = '';
      }
    }, 50);
  }, [adminLevel, featureCodeProperty, featureLabelProperty, featureLabels, choroplethData, tooltipData]);

  // --- Initialise map once -------------------------------------------------
  useEffect(() => {
    if (!mapRef.current) {return;}

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayerRef.current],
      view: new View({ center: SWEDEN_CENTER, zoom: 5.5 }),
      controls: defaultControls({ zoom: false }),
    });

    // Disable OL's built-in double-click zoom — it fires two single clicks
    // plus a zoom, which interferes with the selection interaction.
    map.getInteractions().forEach(interaction => {
      if (interaction instanceof DoubleClickZoom) {
        interaction.setActive(false);
      }
    });

    mapInstanceRef.current = map;
    return () => { map.setTarget(undefined); };
  }, []);

  // --- Re-bind click handler when admin level changes ---------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {return;}
    map.on('click', handleMapClick);
    return () => { map.un('click', handleMapClick); };
  }, [handleMapClick]);

  // --- Register dblclick handler --------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) { return; }
    map.on('dblclick', handleMapDblClick);
    return () => { map.un('dblclick', handleMapDblClick); };
  }, [handleMapDblClick]);

  // --- Register pointermove handler ----------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) { return; }
    map.on('pointermove', handlePointerMove);
    return () => {
      map.un('pointermove', handlePointerMove);
      if (throttleRef.current !== null) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
    };
  }, [handlePointerMove]);

  // --- Swap fill + boundary layers when admin level changes ----------------
  // Both outgoing layers are kept alive until the incoming source fires its
  // first tileloadend, hiding the blank-tile flash during drill-down transitions.
  // Layer z-index stack: fill(1) sub(2) sub-hl(3) boundary(4) sel(5) cmp(6) hl(7)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) { return; }

    // Drop any previous outgoing layers still waiting (rapid level changes).
    if (outgoingFillLayerRef.current) {
      map.removeLayer(outgoingFillLayerRef.current);
      outgoingFillLayerRef.current = null;
    }
    if (outgoingBoundaryLayerRef.current) {
      map.removeLayer(outgoingBoundaryLayerRef.current);
      outgoingBoundaryLayerRef.current = null;
    }

    // Demote current fill + boundary to "outgoing" — keep them visible while
    // the new source loads.
    if (fillLayerRef.current) {
      outgoingFillLayerRef.current = fillLayerRef.current;
      fillLayerRef.current = null;
    }
    if (boundaryLayerRef.current) {
      outgoingBoundaryLayerRef.current = boundaryLayerRef.current;
      boundaryLayerRef.current = null;
    }

    // Highlight + comparison layers are source-coupled — recreate immediately.
    if (highlightLayerRef.current) { map.removeLayer(highlightLayerRef.current); highlightLayerRef.current = null; }
    if (comparisonSelectionLayerRef.current) { map.removeLayer(comparisonSelectionLayerRef.current); comparisonSelectionLayerRef.current = null; }

    hoveredCodeRef.current = null;

    const { url } = adminVectorTileLayers[adminLevel];
    const source = createVectorTileSource(url);
    sourceRef.current = source;

    const fillLayer      = createVectorTileLayer(source);
    const boundaryLayer  = createBoundaryLayer(source);
    const highlightLayer = createHighlightLayer(source, featureCodeProperty, hoveredCodeRef);

    fillLayer.setZIndex(1);
    fillLayer.setOpacity(fillOpacityRef.current);
    boundaryLayer.setZIndex(4);
    highlightLayer.setZIndex(7);
    map.addLayer(fillLayer);
    map.addLayer(boundaryLayer);
    map.addLayer(highlightLayer);
    fillLayerRef.current      = fillLayer;
    boundaryLayerRef.current  = boundaryLayer;
    highlightLayerRef.current = highlightLayer;

    // Remove outgoing layers once the first tile from the new source has painted.
    let settled = false;
    const onTileLoad = () => {
      if (settled) { return; }
      settled = true;
      if (outgoingFillLayerRef.current) {
        map.removeLayer(outgoingFillLayerRef.current);
        outgoingFillLayerRef.current = null;
      }
      if (outgoingBoundaryLayerRef.current) {
        map.removeLayer(outgoingBoundaryLayerRef.current);
        outgoingBoundaryLayerRef.current = null;
      }
      source.un('tileloadend', onTileLoad);
    };
    source.on('tileloadend', onTileLoad);

    return () => {
      source.un('tileloadend', onTileLoad);
      // Effect re-ran before tiles arrived — remove outgoing layers now.
      if (!settled) {
        if (outgoingFillLayerRef.current) {
          map.removeLayer(outgoingFillLayerRef.current);
          outgoingFillLayerRef.current = null;
        }
        if (outgoingBoundaryLayerRef.current) {
          map.removeLayer(outgoingBoundaryLayerRef.current);
          outgoingBoundaryLayerRef.current = null;
        }
      }
    };
  }, [adminLevel, featureCodeProperty]);

  // --- Show selection outline + sub-boundary when a feature is selected ----
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {return;}

    // Remove previous selection/sub-boundary/sub-highlight layers
    if (subLayerRef.current)          { map.removeLayer(subLayerRef.current);          subLayerRef.current          = null; }
    if (subHighlightLayerRef.current) { map.removeLayer(subHighlightLayerRef.current); subHighlightLayerRef.current = null; }
    if (selectionLayerRef.current)    { map.removeLayer(selectionLayerRef.current);    selectionLayerRef.current    = null; }

    hoveredSubCodeRef.current = null;
    selectedCodeRef.current   = selectedFeature?.code ?? null;

    if (!selectedFeature || !sourceRef.current) {return;}

    // Zoom the view to the selected feature. AbortController in the cleanup
    // cancels any in-flight WFS request when this effect re-runs or when React
    // StrictMode unmounts the first mount, so only the live view gets animated.
    const controller = new AbortController();
    const view       = map.getView();
    zoomToWfsFeature(view, map, adminWfsLayers[adminLevel], featureCodeProperty, selectedFeature.code, LEVEL_MAX_ZOOM[adminLevel], controller.signal);

    // Selection outline (z=5) — shares source with main layer, no extra tile fetches
    const selLayer = createSelectionLayer(sourceRef.current, featureCodeProperty, selectedCodeRef);
    selLayer.setZIndex(5);
    map.addLayer(selLayer);
    selectionLayerRef.current = selLayer;

    // Sub-boundary + sub-hover-highlight layers (z=2, z=3) — one level down
    const subLevel    = SUB_LEVEL[adminLevel];
    const filterProp  = SUB_LEVEL_FILTER_PROP[adminLevel];
    const subCodeProp = SUB_LEVEL_CODE_PROP[adminLevel];
    if (subLevel && filterProp && subCodeProp) {
      const subSource    = createVectorTileSource(adminVectorTileLayers[subLevel].url);
      const subLayer     = createSubBoundaryLayer(subSource, filterProp, selectedFeature.code);
      const subHighlight = createHighlightLayer(subSource, subCodeProp, hoveredSubCodeRef);
      subLayer.setZIndex(2);
      subHighlight.setZIndex(3);
      map.addLayer(subLayer);
      map.addLayer(subHighlight);
      subLayerRef.current          = subLayer;
      subHighlightLayerRef.current = subHighlight;
    }

    return () => controller.abort();
  }, [selectedFeature, adminLevel, featureCodeProperty]);

  // --- Show/update comparison outline when comparisonFeature changes ------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) { return; }

    if (comparisonSelectionLayerRef.current) {
      map.removeLayer(comparisonSelectionLayerRef.current);
      comparisonSelectionLayerRef.current = null;
    }

    comparisonCodeRef.current = comparisonFeature?.code ?? null;

    if (!comparisonFeature || !sourceRef.current) { return; }

    const compLayer = createComparisonSelectionLayer(sourceRef.current, featureCodeProperty, comparisonCodeRef);
    compLayer.setZIndex(6);
    map.addLayer(compLayer);
    comparisonSelectionLayerRef.current = compLayer;
  }, [comparisonFeature, featureCodeProperty]);

  // --- Reset map view to Sweden overview when resetToken increments --------
  useEffect(() => {
    if (!resetToken) { return; }
    mapInstanceRef.current?.getView().animate({ center: SWEDEN_CENTER, zoom: 5.5, duration: 600 });
  }, [resetToken]);

  // --- Update choropleth style in place when data changes -----------------
  useEffect(() => {
    const layer = fillLayerRef.current;
    if (!layer) { return; }

    if (matchingAreas) {
      if (choroplethData && colorScale) {
        layer.setStyle(buildFilteredChoroplethStyle(choroplethData, colorScale, featureCodeProperty, matchingAreas, true));
      } else {
        // No choropleth loaded — fall back to binary blue/gray filter style.
        layer.setStyle(buildFilterStyle(matchingAreas, featureCodeProperty));
      }
    } else if (mapColorFn) {
      layer.setStyle(buildCategoricalStyle(mapColorFn, featureCodeProperty, true));
    } else if (choroplethData && colorScale) {
      layer.setStyle(buildChoroplethStyle(choroplethData, colorScale, featureCodeProperty, true));
    } else {
      layer.setStyle(baseFillStyle);
    }
    // Probably bad for performance but fewer visual issues.
    // Bump the source revision so OL's hybrid-mode renderer knows to regenerate
    // cached tile canvases. Without this, stale canvases can persist after a
    // breadcrumb/Escape navigation returns to a previously-rendered level.
    sourceRef.current?.changed();
  }, [choroplethData, colorScale, mapColorFn, matchingAreas, featureCodeProperty]);

  // --- Update fill layer opacity when prop changes ------------------------
  useEffect(() => {
    fillLayerRef.current?.setOpacity(fillOpacity);
  }, [fillOpacity]);

  // --- Swap base map layer -------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {return;}

    map.removeLayer(baseLayerRef.current);
    if (selectedBase === 'None') {
      baseLayerRef.current = new TileLayer({ visible: false });
    } else {
      baseLayerRef.current = new TileLayer({ source: baseMaps[selectedBase] });
    }
    baseLayerRef.current.setZIndex(0);
    map.addLayer(baseLayerRef.current);
  }, [selectedBase]);

  return (
    <div className="relative w-full h-full" style={{ backgroundColor: '#b8d4e4' }}>
      <div ref={mapRef} className="w-full h-full" />

      <Tooltip ref={tooltipRef} visible={hoveredFeature !== null}>
        {hoveredFeature && (
          <>
            <div className="font-semibold">{hoveredFeature.label}</div>
            {hoveredFeature.tooltip !== null && (
              <div className="text-gray-300">{hoveredFeature.tooltip}</div>
            )}
            {hoveredFeature.tooltip === null && hoveredFeature.value !== null && (
              <div className="text-gray-300">
                {hoveredFeature.value.toLocaleString('sv-SE')} {unit}
              </div>
            )}
          </>
        )}
      </Tooltip>
    </div>
  );
};

export default MapView;
