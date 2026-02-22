import { OSM, XYZ } from "ol/source";

export const baseMaps = {
  OSM: new OSM(),
  Satellite: new XYZ({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attributions: '© Esri & contributors',
    maxZoom: 19,
  }),
  EsriTopo: new XYZ({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}",
    attributions: '© Esri & contributors',
    maxZoom: 19
  }),
  EsriWorldGray: new XYZ({
    url: "https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
    attributions: '© Esri & contributors',
    maxZoom: 16
  }),
  CartoPositron: new XYZ({
    url: "https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
    attributions: '© CARTO & OpenStreetMap contributors',
    maxZoom: 19
  }),
  EsriNatGeo: new XYZ({
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/NatGeo_World_Map/MapServer/tile/{z}/{y}/{x}",
    attributions: '© Esri & contributors',
    maxZoom: 16
  })
};

export type BaseMapKey = keyof typeof baseMaps;