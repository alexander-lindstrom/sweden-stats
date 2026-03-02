import { XYZ } from "ol/source";

export const baseMaps = {
  CartoGray: new XYZ({
    url: 'https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png',
    attributions: '© <a href="https://carto.com/">CARTO</a> & © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }),
  CartoPositron: new XYZ({
    url: 'https://basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    attributions: '© <a href="https://carto.com/">CARTO</a> & © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 19,
  }),
  Satellite: new XYZ({
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attributions: '© Esri & contributors',
    maxZoom: 19,
  }),
};

export type BaseMapKey = keyof typeof baseMaps | 'None';

export const baseMapLabels: Record<BaseMapKey, string> = {
  None:          'Ingen',
  CartoGray:     'Grå (utan etiketter)',
  CartoPositron: 'Ljus (med etiketter)',
  Satellite:     'Satellit',
};
