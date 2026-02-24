import React, { useCallback, useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import { fromLonLat } from "ol/proj";
import "ol/ol.css";
import BaseLayer from "ol/layer/Base";

import { BaseMapKey, baseMaps } from "./BaseMaps";
import {
  adminVectorTileLayers,
  buildChoroplethStyle,
  createChoroplethLayer,
  createVectorTileLayer,
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

interface HoverInfo {
  x: number;
  y: number;
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
  const mapRef          = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef  = useRef<Map | null>(null);
  const baseLayerRef    = useRef<TileLayer<OSM | XYZ>>(
    new TileLayer({ source: baseMaps.EsriNatGeo, visible: false })
  );
  const overlayLayerRef = useRef<BaseLayer | null>(null);
  const [hoverInfo, setHoverInfo] = useState<HoverInfo | null>(null);

  // --- Click handler -------------------------------------------------------
  const handleMapClick = useCallback((evt: MapBrowserEvent) => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    map.forEachFeatureAtPixel(
      evt.pixel,
      (feature) => {
        const geometry = feature.getGeometry();
        const view = map.getView();

        if (!geometry) {
          return false;
        }

        const extent = geometry.getExtent();
        view.animate({
          center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2],
          zoom: LEVEL_CLICK_ZOOM[adminLevel],
          duration: 800,
        });
        return true;
      },
      {
        layerFilter: (layer) => layer instanceof VectorTileLayer,
        hitTolerance: 5,
      }
    );
  }, [adminLevel]);

  // --- Initialise map once -------------------------------------------------
  useEffect(() => {
    if (!mapRef.current) {
      return;
    }

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
    if (!map) {
      return;
    }
    map.on('click', handleMapClick);
    return () => { map.un('click', handleMapClick); };
  }, [handleMapClick]);

  // --- Pointermove: update hover tooltip -----------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    const handlePointerMove = (evt: MapBrowserEvent) => {
      if (evt.dragging) {
        setHoverInfo(null);
        return;
      }

      let found = false;
      map.forEachFeatureAtPixel(
        evt.pixel,
        (feature) => {
          const code  = String(feature.get(featureCodeProperty) ?? '');
          const label = String(feature.get(featureLabelProperty) ?? code);
          const value = choroplethData?.[code] ?? null;
          setHoverInfo({ x: evt.pixel[0], y: evt.pixel[1], label, value });
          found = true;
          return true;
        },
        { layerFilter: (l) => l instanceof VectorTileLayer, hitTolerance: 3 }
      );

      if (!found) {
        setHoverInfo(null);
      }
    };

    map.on('pointermove', handlePointerMove);
    return () => { map.un('pointermove', handlePointerMove); };
  }, [featureCodeProperty, featureLabelProperty, choroplethData]);

  // --- Swap boundary layer when admin level changes -----------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    if (overlayLayerRef.current) {
      map.removeLayer(overlayLayerRef.current);
      overlayLayerRef.current = null;
    }

    const { id, url } = adminVectorTileLayers[adminLevel];

    const layer =
      choroplethData && colorScale
        ? createChoroplethLayer(
            id,
            url,
            buildChoroplethStyle(choroplethData, colorScale, featureCodeProperty),
          )
        : createVectorTileLayer(id, url);

    layer.setZIndex(1);
    map.addLayer(layer);
    overlayLayerRef.current = layer;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminLevel]);

  // --- Update choropleth style in place when data changes -----------------
  useEffect(() => {
    const layer = overlayLayerRef.current;
    if (!(layer instanceof VectorTileLayer)) {
      return;
    }

    if (choroplethData && colorScale) {
      layer.setStyle(
        buildChoroplethStyle(choroplethData, colorScale, featureCodeProperty)
      );
    } else {
      const map = mapInstanceRef.current;
      if (!map) {
        return;
      }
      map.removeLayer(layer);
      const { id, url } = adminVectorTileLayers[adminLevel];
      const newLayer = createVectorTileLayer(id, url);
      newLayer.setZIndex(1);
      map.addLayer(newLayer);
      overlayLayerRef.current = newLayer;
    }
  }, [choroplethData, colorScale, featureCodeProperty, adminLevel]);

  // --- Swap base map layer -------------------------------------------------
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    map.removeLayer(baseLayerRef.current);
    baseLayerRef.current = new TileLayer({ source: baseMaps[selectedBase] });
    baseLayerRef.current.setZIndex(0);
    map.addLayer(baseLayerRef.current);
  }, [selectedBase]);

  return (
    <div className="relative w-full h-full">
      <div ref={mapRef} className="w-full h-full" />
      <Tooltip
        x={hoverInfo?.x ?? 0}
        y={hoverInfo?.y ?? 0}
        visible={hoverInfo !== null}
      >
        {hoverInfo && (
          <>
            <div className="font-semibold">{hoverInfo.label}</div>
            {hoverInfo.value !== null && (
              <div className="text-gray-300">
                {hoverInfo.value.toLocaleString('sv-SE')} {unit}
              </div>
            )}
          </>
        )}
      </Tooltip>
    </div>
  );
};

export default MapView;
