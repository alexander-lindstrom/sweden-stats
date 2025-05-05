import React, { useEffect, useRef, useState } from "react";
import Map from "ol/Map";
import View from "ol/View";
import TileLayer from "ol/layer/Tile";
import OSM from "ol/source/OSM";
import XYZ from "ol/source/XYZ";
import { fromLonLat } from "ol/proj";
import "ol/ol.css";
import BaseLayer from "ol/layer/Base";

import { BaseMapKey, baseMaps } from "./BaseMaps";
import { adminVectorTileLayers, createVectorTileLayer } from "./VectorTiles";
import { MapControls } from "./MapControls";
import { Feature } from "ol";
import VectorTileLayer from "ol/layer/VectorTile";

const MapView: React.FC = () => {
  const mapRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const baseLayerRef = useRef<TileLayer<OSM | XYZ>>(new TileLayer({ source: baseMaps.EsriNatGeo }));
  const overlayLayersRef = useRef<Record<string, BaseLayer>>({});

  const [selectedBase, setSelectedBase] = useState<BaseMapKey>("EsriNatGeo");
  const [selectedAdminLevel, setSelectedAdminLevel] = useState<keyof typeof adminVectorTileLayers>("Region");

  useEffect(() => {
    if (!mapRef.current) return;

    const map = new Map({
      target: mapRef.current,
      layers: [baseLayerRef.current],
      view: new View({
        center: fromLonLat([15.0, 63.0]),
        zoom: 6,
      }),
    });

    mapInstanceRef.current = map;
    map.on('click', handleMapClick);

    return () => {
      map.setTarget(undefined);
      map.un('click', handleMapClick);
    };
  }, []);


  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
  
    // Clear any previous admin layer
    Object.values(overlayLayersRef.current).forEach(layer => {
      map.removeLayer(layer);
    });
    overlayLayersRef.current = {};
  
    const { id, url } = adminVectorTileLayers[selectedAdminLevel];
    const vectorLayer = createVectorTileLayer(id, url);
    overlayLayersRef.current[id] = vectorLayer;
  
    map.addLayer(vectorLayer);
  }, [selectedAdminLevel]);

  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Remove the old base layer
    map.removeLayer(baseLayerRef.current);

    // Create and add the new base layer
    baseLayerRef.current = new TileLayer({ source: baseMaps[selectedBase] });
    map.addLayer(baseLayerRef.current);

    // Ensure the base layer is at the bottom
    baseLayerRef.current.setZIndex(0);
  }, [selectedBase]);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMapClick = (evt: any) => {
    const map = mapInstanceRef.current;
    if (!map) return;
  
    map.forEachFeatureAtPixel(evt.pixel, (feature) => {
      if (feature instanceof Feature) {
        const props = feature.getProperties();
        delete props.geometry;
        alert("Feature properties:\n" + JSON.stringify(props, null, 2));
      }
    }, {
      layerFilter: (layer) => layer instanceof VectorTileLayer,
      hitTolerance: 5,
    });
  };
  
  return (
    <>
      <div
        style={{
          position: "absolute",
          bottom: "16px",
          left: "16px",
          zIndex: 1000,
          display: "flex",
          flexDirection: "column",
          gap: "5px",
          width: "250px",
          padding: "10px",
          borderRadius: "4px",
        }}
      >

        <MapControls
          selectedBase={selectedBase}
          setSelectedBase={(value) => setSelectedBase(value as BaseMapKey)}
          baseMapKeys={baseMaps}
          selectedAdminLevel={selectedAdminLevel}
          setSelectedAdminLevel={setSelectedAdminLevel}
        />

      </div>

      <div ref={mapRef} style={{ width: "100%", height: "100vh" }} />
    </>
  );
};

export default MapView;