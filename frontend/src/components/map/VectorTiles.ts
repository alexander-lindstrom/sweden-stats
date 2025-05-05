import VectorTileLayer from "ol/layer/VectorTile";
import MVT from "ol/format/MVT";
import VectorTileSource from "ol/source/VectorTile";

export function createVectorTileLayer(id: string, urlTemplate: string) {
  return new VectorTileLayer({
    source: new VectorTileSource({
      format: new MVT(),
      url: urlTemplate,
      maxZoom: 14,
    }),
    declutter: true,
    visible: true,
    style: null,
  });
}

export const adminVectorTileLayers = {
    Region: {
      id: "region_mvt",
      url: "https://your-server/geoserver/gwc/service/tms/1.0.0/namespace:region@EPSG%3A3857@pbf/{z}/{x}/{y}.pbf"
    },
    Municipality: {
      id: "municipality_mvt",
      url: "https://your-server/geoserver/gwc/service/tms/1.0.0/namespace:municipality@EPSG%3A3857@pbf/{z}/{x}/{y}.pbf"
    },
    RegSO: {
      id: "regso_mvt",
      url: "https://your-server/geoserver/gwc/service/tms/1.0.0/namespace:regso@EPSG%3A3857@pbf/{z}/{x}/{y}.pbf"
    },
    DeSO: {
      id: "deso_mvt",
      url: "https://your-server/geoserver/gwc/service/tms/1.0.0/namespace:deso@EPSG%3A3857@pbf/{z}/{x}/{y}.pbf"
    },
  };
  
