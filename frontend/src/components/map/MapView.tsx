import React, { useCallback, useEffect, useRef } from "react";
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

// Which child boundary layer to show for each admin level
const LEVEL_TO_CHILD: Record<AdminLevel, keyof typeof adminVectorTileLayers> = {
  Country:      'Region',
  Region:       'Municipality',
  Municipality: 'RegSO',
  RegSO:        'DeSO',
  DeSO:         'DeSO',
};

// Zoom level to animate to when clicking a feature
const ADMIN_LEVEL_ZOOM: Record<keyof typeof adminVectorTileLayers, number> = {
  Country:      5,
  Region:       7,
  Municipality: 10,
  RegSO:        12,
  DeSO:         13,
};

const SWEDEN_CENTER = fromLonLat([15.0, 63.0]);

export interface MapViewProps {
  adminLevel: AdminLevel;
  selectedBase: BaseMapKey;
  choroplethData: Record<string, number> | null;
  colorScale: ((value: number) => string) | null;
  featureCodeProperty: string;
}

const MapView: React.FC<MapViewProps> = ({
  adminLevel,
  selectedBase,
  choroplethData,
  colorScale,
  featureCodeProperty,
}) => {
  const mapRef          = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef  = useRef<Map | null>(null);
  const baseLayerRef    = useRef<TileLayer<OSM | XYZ>>(
    new TileLayer({ source: baseMaps.EsriNatGeo, visible: false })
  );
  const overlayLayerRef = useRef<BaseLayer | null>(null);

  // --- Click handler -------------------------------------------------------
  const handleMapClick = useCallback((evt: MapBrowserEvent) => {
    const map = mapInstanceRef.current;
    if (!map) {
      return;
    }

    const childLevel = LEVEL_TO_CHILD[adminLevel];

    map.forEachFeatureAtPixel(
      evt.pixel,
      (feature) => {
        const view = map.getView();

        if (adminLevel === 'Country') {
          view.animate({
            center: SWEDEN_CENTER,
            zoom: ADMIN_LEVEL_ZOOM.Country,
            duration: 800,
          });
        } else {
          const geometry = feature.getGeometry();
          if (!geometry) {
            return false;
          }
          const extent = geometry.getExtent();
          view.animate({
            center: [(extent[0] + extent[2]) / 2, (extent[1] + extent[3]) / 2],
            zoom: ADMIN_LEVEL_ZOOM[childLevel],
            duration: 800,
          });
        }
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

    const childLevel = LEVEL_TO_CHILD[adminLevel];
    const { id, url } = adminVectorTileLayers[childLevel];

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

    if (adminLevel === 'Country') {
      map.getView().animate({
        center: SWEDEN_CENTER,
        zoom: ADMIN_LEVEL_ZOOM.Country,
        duration: 800,
      });
    }
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
      // Revert to static style by recreating the static layer
      const map = mapInstanceRef.current;
      if (!map) {
        return;
      }
      map.removeLayer(layer);
      const childLevel = LEVEL_TO_CHILD[adminLevel];
      const { id, url } = adminVectorTileLayers[childLevel];
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

  return <div ref={mapRef} style={{ width: '100%', height: '100%' }} />;
};

export default MapView;
