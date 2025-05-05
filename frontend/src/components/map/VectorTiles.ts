import VectorTileLayer from "ol/layer/VectorTile";
import MVT from "ol/format/MVT";
import VectorTileSource from "ol/source/VectorTile";
import Stroke from "ol/style/Stroke";
import Fill from "ol/style/Fill";
import Style from "ol/style/Style";

// Example basic style
const basicVectorStyle = new Style({
  fill: new Fill({
    color: 'rgba(50, 50, 255, 0.4)',
  }),
  stroke: new Stroke({
    color: '#333399',
    width: 1,
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
    style: basicVectorStyle,
  });
}

export const adminVectorTileLayers = {
  Region: {
    id: "region_mvt",
    url: "http://localhost:8080/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=map-gis:sveriges_lan_sf_simple&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  },
  Municipality: {
    id: "municipality_mvt",
    url: "https://your-server/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=namespace:municipality&STYLE=&TILEMATRIXSET=EPSG:3857&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:3857:{z}&TILECOL={x}&TILEROW={y}"
  },
  
  RegSO: {
    id: "regso_mvt",
    url: "http://localhost:8080/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=map-gis:RegSo_2025&STYLE=&TILEMATRIXSET=EPSG:900913&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:900913:{z}&TILECOL={x}&TILEROW={y}"
  },
  
  DeSO: {
    id: "deso_mvt",
    url: "http://localhost:8080/geoserver/gwc/service/wmts?REQUEST=GetTile&SERVICE=WMTS&VERSION=1.0.0&LAYER=namespace:deso&STYLE=&TILEMATRIXSET=EPSG:3857&FORMAT=application/vnd.mapbox-vector-tile&TILEMATRIX=EPSG:3857:{z}&TILECOL={x}&TILEROW={y}"
  }
};
  
