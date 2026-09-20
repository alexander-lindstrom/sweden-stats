import { XYZ } from "ol/source";

// Esri's free basemap services. No key needed; attribution is the only condition.
// Carto's keyless tiles were dropped in September 2026 when they started
// watermarking every tile with "API key required".
const ESRI_TILES       = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTRIBUTION = '© Esri, HERE, Garmin, © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function esriSource(service: string, maxZoom: number): XYZ {
  return new XYZ({
    url:          `${ESRI_TILES}/${service}/MapServer/tile/{z}/{y}/{x}`,
    attributions: ESRI_ATTRIBUTION,
    maxZoom,
  });
}

/**
 * Each base map is a stack of raster sources, drawn bottom to top. Esri splits
 * the light gray canvas into ground and labels, so the labelled variant is the
 * plain one plus the reference overlay.
 */
export const baseMaps: Record<'LightGray' | 'LightGrayLabels' | 'Satellite', XYZ[]> = {
  LightGray: [
    esriSource('Canvas/World_Light_Gray_Base', 16),
  ],
  LightGrayLabels: [
    esriSource('Canvas/World_Light_Gray_Base', 16),
    esriSource('Canvas/World_Light_Gray_Reference', 16),
  ],
  Satellite: [
    esriSource('World_Imagery', 19),
  ],
};

export type BaseMapKey = keyof typeof baseMaps | 'None';

export const baseMapLabels: Record<BaseMapKey, string> = {
  None:            'Ingen',
  LightGray:       'Grå (utan etiketter)',
  LightGrayLabels: 'Grå (med etiketter)',
  Satellite:       'Satellit',
};
