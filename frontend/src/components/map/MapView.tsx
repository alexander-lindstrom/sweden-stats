import React, { useCallback, useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import { fromLonLat } from "ol/proj";
import { getCenter } from "ol/extent";
import GeoJSON from "ol/format/GeoJSON";
import "ol/ol.css";

import { BaseMapKey, baseMaps } from "./BaseMaps";
import {
  adminVectorTileLayers,
  adminWfsLayers,
  baseVectorStyle,
  buildChoroplethStyle,
  createChoroplethLayer,
  createHighlightLayer,
  createVectorTileLayer,
  createVectorTileSource,
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
  unit: string;
}

const MapView: React.FC<MapViewProps> = ({
  adminLevel,
  selectedBase,
  choroplethData,
  colorScale,
  featureCodeProperty,
  featureLabelProperty,
  unit,
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

  // Hit-test throttle refs (50 ms ≈ 20/s)
  const throttleRef  = useRef<number | null>(null);
  const lastPixelRef = useRef<[number, number] | null>(null);

  // Tooltip DOM ref — position is updated directly, bypassing React
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const [hoveredFeature, setHoveredFeature] = useState<HoveredFeature | null>(null);

  // --- Click handler: zoom to true feature centroid via WFS -----------------
  const handleMapClick = useCallback((evt: MapBrowserEvent) => {
    const map = mapInstanceRef.current;
    if (!map) {return;}

    let clickedCode: string | null = null;
    let fallbackCenter: [number, number] | null = null;

    map.forEachFeatureAtPixel(
      evt.pixel,
      (feature) => {
        clickedCode = String(feature.get(featureCodeProperty) ?? '');
        const geom = feature.getGeometry();
        if (geom) {
          const ext = geom.getExtent();
          fallbackCenter = [(ext[0] + ext[2]) / 2, (ext[1] + ext[3]) / 2];
        }
        return true;
      },
      { layerFilter: (layer) => layer === overlayLayerRef.current, hitTolerance: 5 }
    );

    if (!clickedCode) {return;}

    const view  = map.getView();
    const code  = clickedCode;
    const level = adminLevel;

    const params = new URLSearchParams({
      service:       'WFS',
      version:       '2.0.0',
      request:       'GetFeature',
      typeNames:     adminWfsLayers[level],
      CQL_FILTER:    `${featureCodeProperty}='${code}'`,
      outputFormat:  'application/json',
      srsName:       'EPSG:3857',
      count:         '1',
    });

    fetch(`http://localhost:8080/geoserver/wfs?${params}`)
      .then(r => r.json())
      .then(geojson => {
        if (geojson.features?.length > 0) {
          const format   = new GeoJSON();
          const features = format.readFeatures(geojson);
          const extent   = features[0].getGeometry()?.getExtent();
          if (extent) {
            view.animate({ center: getCenter(extent), zoom: LEVEL_CLICK_ZOOM[level], duration: 800 });
            return;
          }
        }
        if (fallbackCenter) {
          view.animate({ center: fallbackCenter, zoom: LEVEL_CLICK_ZOOM[level], duration: 800 });
        }
      })
      .catch(() => {
        if (fallbackCenter) {
          view.animate({ center: fallbackCenter, zoom: LEVEL_CLICK_ZOOM[level], duration: 800 });
        }
      });
  }, [adminLevel, featureCodeProperty]);

  // --- Initialise map once -------------------------------------------------
  useEffect(() => {
    if (!mapRef.current) {return;}

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayerRef.current],
      view: new View({ center: SWEDEN_CENTER, zoom: 6 }),
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
          { layerFilter: (l) => l === overlayLayerRef.current, hitTolerance: 3 }
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
  }, [featureCodeProperty, featureLabelProperty, choroplethData]);

  // --- Swap boundary layer when admin level changes -----------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {return;}

    if (overlayLayerRef.current)  { map.removeLayer(overlayLayerRef.current);  overlayLayerRef.current  = null; }
    if (highlightLayerRef.current) { map.removeLayer(highlightLayerRef.current); highlightLayerRef.current = null; }

    hoveredCodeRef.current = null;

    const { url } = adminVectorTileLayers[adminLevel];
    const source = createVectorTileSource(url);

    const mainLayer =
      choroplethData && colorScale
        ? createChoroplethLayer(source, buildChoroplethStyle(choroplethData, colorScale, featureCodeProperty))
        : createVectorTileLayer(source);

    const highlightLayer = createHighlightLayer(source, featureCodeProperty, hoveredCodeRef);

    mainLayer.setZIndex(1);
    highlightLayer.setZIndex(2);
    map.addLayer(mainLayer);
    map.addLayer(highlightLayer);
    overlayLayerRef.current  = mainLayer;
    highlightLayerRef.current = highlightLayer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLevel]);

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
