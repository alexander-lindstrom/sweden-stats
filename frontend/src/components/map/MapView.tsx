import React, { useCallback, useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import DoubleClickZoom from "ol/interaction/DoubleClickZoom";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import { fromLonLat } from "ol/proj";
import { getCenter } from "ol/extent";
import GeoJSON from "ol/format/GeoJSON";
import VectorTileSource from "ol/source/VectorTile";
import "ol/ol.css";

import { BaseMapKey, baseMaps } from "./BaseMaps";
import {
  adminVectorTileLayers,
  adminWfsLayers,
  baseVectorStyle,
  buildChoroplethStyle,
  createChoroplethLayer,
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

const LEVEL_CLICK_ZOOM: Record<AdminLevel, number> = {
  Country:      5,
  Region:       7,
  Municipality: 8,
  RegSO:        9,
  DeSO:         10,
};

const SWEDEN_CENTER = fromLonLat([15.0, 63.0]);

interface HoveredFeature {
  label: string;
  value: number | null;
}

export interface MapViewProps {
  adminLevel: AdminLevel;
  selectedBase: BaseMapKey;
  choroplethData: Record<string, number> | null;
  colorScale: ((value: number) => string) | null;
  featureCodeProperty: string;
  featureLabelProperty: string;
  featureParentProperty?: string;
  unit: string;
  selectedFeature: { code: string; label: string; parentCode?: string } | null;
  onFeatureSelect: (f: { code: string; label: string; parentCode?: string } | null) => void;
  onDrillDown: (level: AdminLevel, code: string, label: string, parentCode?: string) => void;
}

// Module-level helper — zoom the OL view to a WFS feature, falling back to a
// pre-computed centre if the GeoServer request fails or returns nothing.
function zoomToWfsFeature(
  view: View,
  wfsTypeName: string,
  codeProperty: string,
  code: string,
  zoom: number,
  fallbackCenter: [number, number] | null,
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
  fetch(`http://localhost:8080/geoserver/wfs?${params}`)
    .then(r => r.json())
    .then(geojson => {
      if (geojson.features?.length > 0) {
        const features = new GeoJSON().readFeatures(geojson);
        const extent   = features[0].getGeometry()?.getExtent();
        if (extent) {
          view.animate({ center: getCenter(extent), zoom, duration: 800 });
          return;
        }
      }
      if (fallbackCenter) {
        view.animate({ center: fallbackCenter, zoom, duration: 800 });
      }
    })
    .catch(() => {
      if (fallbackCenter) {
        view.animate({ center: fallbackCenter, zoom, duration: 800 });
      }
    });
}

const MapView: React.FC<MapViewProps> = ({
  adminLevel,
  selectedBase,
  choroplethData,
  colorScale,
  featureCodeProperty,
  featureLabelProperty,
  featureParentProperty,
  unit,
  selectedFeature,
  onFeatureSelect,
  onDrillDown,
}) => {
  const mapRef           = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef   = useRef<Map | null>(null);
  const baseLayerRef     = useRef<TileLayer<OSM | XYZ>>(
    new TileLayer({ source: baseMaps.EsriNatGeo, visible: false })
  );
  const overlayLayerRef  = useRef<VectorTileLayer | null>(null);
  // Separate lightweight layer for hover highlight — shares the same source as
  // overlayLayerRef so no extra tile fetches. Only re-renders this layer on
  // hover changes instead of the full (expensive) choropleth layer.
  const highlightLayerRef = useRef<VectorTileLayer | null>(null);
  const hoveredCodeRef    = useRef<string | null>(null);
  const sourceRef            = useRef<VectorTileSource | null>(null);
  const selectedCodeRef      = useRef<string | null>(null);
  const subLayerRef          = useRef<VectorTileLayer | null>(null);
  const subHighlightLayerRef = useRef<VectorTileLayer | null>(null);
  const selectionLayerRef    = useRef<VectorTileLayer | null>(null);
  const hoveredSubCodeRef    = useRef<string | null>(null);

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
    const view = map.getView();

    // -- Priority 1: sub-layer --
    const subLayer = subLayerRef.current;
    if (subLayer && selectedCodeRef.current) {
      const subLevel     = SUB_LEVEL[adminLevel];
      const subCodeProp  = SUB_LEVEL_CODE_PROP[adminLevel];
      const subLabelProp = SUB_LEVEL_LABEL_PROP[adminLevel];
      const filterProp   = SUB_LEVEL_FILTER_PROP[adminLevel];

      if (subLevel && subCodeProp && subLabelProp && filterProp) {
        let subCode: string | null = null;
        let subLabel: string | null = null;
        let subFallback: [number, number] | null = null;

        map.forEachFeatureAtPixel(
          evt.pixel,
          (feature) => {
            // Only accept features that belong to the selected parent.
            if (String(feature.get(filterProp) ?? '') !== selectedCodeRef.current) {return;}
            subCode  = String(feature.get(subCodeProp) ?? '');
            subLabel = String(feature.get(subLabelProp) ?? subCode);
            const geom = feature.getGeometry();
            if (geom) {
              const ext = geom.getExtent();
              subFallback = [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2];
            }
            return true;
          },
          { layerFilter: (l) => l === subLayer, hitTolerance: 5 },
        );

        if (subCode) {
          // The currently selected feature is the direct parent of the drilled sub-feature.
          onDrillDown(subLevel, subCode, subLabel ?? subCode, selectedCodeRef.current ?? undefined);
          zoomToWfsFeature(view, adminWfsLayers[subLevel], subCodeProp, subCode, LEVEL_CLICK_ZOOM[subLevel], subFallback);
          return;
        }
      }
    }

    // -- Priority 2: main overlay layer --
    let clickedCode: string | null = null;
    let clickedLabel: string | null = null;
    let clickedParentCode: string | undefined = undefined;
    let fallbackCenter: [number, number] | null = null;

    map.forEachFeatureAtPixel(
      evt.pixel,
      (feature) => {
        clickedCode  = String(feature.get(featureCodeProperty) ?? '');
        clickedLabel = String(feature.get(featureLabelProperty) ?? clickedCode);
        if (featureParentProperty) {
          const p = feature.get(featureParentProperty);
          if (p) { clickedParentCode = String(p); }
        }
        const geom = feature.getGeometry();
        if (geom) {
          const ext = geom.getExtent();
          fallbackCenter = [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2];
        }
        return true;
      },
      { layerFilter: (layer) => layer === overlayLayerRef.current, hitTolerance: 5 },
    );

    if (!clickedCode) {
      onFeatureSelect(null); // empty-space click → deselect
      return;
    }

    onFeatureSelect({ code: clickedCode, label: clickedLabel ?? clickedCode, parentCode: clickedParentCode });
    zoomToWfsFeature(view, adminWfsLayers[adminLevel], featureCodeProperty, clickedCode, LEVEL_CLICK_ZOOM[adminLevel], fallbackCenter);
  }, [adminLevel, featureCodeProperty, featureLabelProperty, featureParentProperty, onFeatureSelect, onDrillDown]);

  // --- Initialise map once -------------------------------------------------
  useEffect(() => {
    if (!mapRef.current) {return;}

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayerRef.current],
      view: new View({ center: SWEDEN_CENTER, zoom: 6 }),
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

  // --- Pointermove: hover tooltip + highlight -------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {return;}

    const handlePointerMove = (evt: MapBrowserEvent) => {
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
        if (!pixel || !map) { return; }

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
                if (String(feature.get(filterProp) ?? '') !== selectedCodeRef.current) {return;}
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
                setHoveredFeature({ label: subLabel!, value: null });
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
        let result: { code: string; label: string; value: number | null } | null = null;

        map.forEachFeatureAtPixel(
          pixel,
          (feature) => {
            const code  = String(feature.get(featureCodeProperty) ?? '');
            const label = String(feature.get(featureLabelProperty) ?? code);
            const value = choroplethData?.[code] ?? null;
            result = { code, label, value };
            return true;
          },
          { layerFilter: (l) => l === overlayLayerRef.current, hitTolerance: 3 },
        );

        if (result !== null) {
          const { code, label, value } = result;
          if (code !== hoveredCodeRef.current) {
            hoveredCodeRef.current = code;
            // Only re-render the thin highlight layer, not the full choropleth layer
            highlightLayerRef.current?.changed();
            setHoveredFeature({ label, value });
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
    };

    map.on('pointermove', handlePointerMove);
    return () => {
      map.un('pointermove', handlePointerMove);
      if (throttleRef.current !== null) {
        clearTimeout(throttleRef.current);
        throttleRef.current = null;
      }
    };
  }, [adminLevel, featureCodeProperty, featureLabelProperty, choroplethData]);

  // --- Swap boundary layer when admin level changes -----------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {return;}

    if (overlayLayerRef.current)  { map.removeLayer(overlayLayerRef.current);  overlayLayerRef.current  = null; }
    if (highlightLayerRef.current) { map.removeLayer(highlightLayerRef.current); highlightLayerRef.current = null; }

    hoveredCodeRef.current = null;

    const { url } = adminVectorTileLayers[adminLevel];
    const source = createVectorTileSource(url);
    sourceRef.current = source;

    const mainLayer =
      choroplethData && colorScale
        ? createChoroplethLayer(source, buildChoroplethStyle(choroplethData, colorScale, featureCodeProperty))
        : createVectorTileLayer(source);

    const highlightLayer = createHighlightLayer(source, featureCodeProperty, hoveredCodeRef);

    mainLayer.setZIndex(1);
    highlightLayer.setZIndex(5);
    map.addLayer(mainLayer);
    map.addLayer(highlightLayer);
    overlayLayerRef.current  = mainLayer;
    highlightLayerRef.current = highlightLayer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLevel]);

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

    // Selection outline (z=4) — shares source with main layer, no extra tile fetches
    const selLayer = createSelectionLayer(sourceRef.current, featureCodeProperty, selectedCodeRef);
    selLayer.setZIndex(4);
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
  }, [selectedFeature, adminLevel, featureCodeProperty]);

  // --- Update choropleth style in place when data changes -----------------
  useEffect(() => {
    const layer = overlayLayerRef.current;
    if (!layer) {return;}

    if (choroplethData && colorScale) {
      layer.setStyle(buildChoroplethStyle(choroplethData, colorScale, featureCodeProperty));
    } else {
      layer.setStyle(baseVectorStyle);
    }
  }, [choroplethData, colorScale, featureCodeProperty]);

  // --- Swap base map layer -------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {return;}

    map.removeLayer(baseLayerRef.current);
    baseLayerRef.current = new TileLayer({ source: baseMaps[selectedBase] });
    baseLayerRef.current.setZIndex(0);
    map.addLayer(baseLayerRef.current);
  }, [selectedBase]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      <Tooltip ref={tooltipRef} visible={hoveredFeature !== null}>
        {hoveredFeature && (
          <>
            <div className="font-semibold">{hoveredFeature.label}</div>
            {hoveredFeature.value !== null && (
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
