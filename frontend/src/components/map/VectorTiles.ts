import VectorTileLayer from "ol/layer/VectorTile";
import MVT from "ol/format/MVT";
import VectorTileSource from "ol/source/VectorTile";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import Style from "ol/style/Style";
import type { FeatureLike } from "ol/Feature";

const baseVectorStyle = new Style({
  fill: new Fill({
    color: 'rgba(100, 149, 237, 0.2)', // subtle light blue
  }),
  stroke: new Stroke({
    color: '#1f3f81', // deep desaturated blue
    width: 1.5,
  }),
});

export function createVectorTileLayer(id: string, urlTemplate: string): VectorTileLayer {
  return new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url: urlTemplate,
      maxZoom: 14,
    }),
    declutter: true,
    visible: true,
    style: baseVectorStyle,
  });
}

const choroplethStroke = new Stroke({ color: '#444', width: 0.5 });
const noDataStyle = new Style({
  fill: new Fill({ color: 'rgba(200, 200, 200, 0.4)' }),
  stroke: choroplethStroke,
});

export function createChoroplethLayer(
  id: string,
  urlTemplate: string,
  styleFunction: (feature: FeatureLike) => Style,
): VectorTileLayer {
  return new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url: urlTemplate,
      maxZoom: 14,
    }),
    declutter: true,
    visible: true,
    style: styleFunction,
  });
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
    if (cached) {
      return cached;
    }

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
    url: "http://localhost:8080/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=ne:countries&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  },
  Region: {
    id: "region_mvt",
    url: "http://localhost:8080/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=map-gis:sveriges_lan_sf_simple&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  },
  Municipality: {
    id: "municipality_mvt",
    url: "http://localhost:8080/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=map-gis:sveriges_kommuner_sf_simple&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  },
  
  RegSO: {
    id: "regso_mvt",
    url: "http://localhost:8080/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=map-gis:RegSO_2025&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  },
  
  DeSO: {
    id: "deso_mvt",
    url: "http://localhost:8080/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=map-gis:DeSO_2025&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  }
};
  
