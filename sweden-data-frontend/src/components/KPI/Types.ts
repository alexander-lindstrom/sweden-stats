export interface KPIApiResponse {
    class: string;
    dimension: {
      VaruTjanstegrupp: {
        extension: { show: string };
        label: string;
        category: {
          label: Record<string, string>;
        };
      };
      Tid: {
        category: {
          index: Record<string, number>;
          label: Record<string, string>;
        };
      };
      ContentsCode?: {
        category: {
          label: Record<string, string>;
        };
      };
    };
    extension: {
      px: {
        infofile: string;
        tableid: string;
        decimals: number;
      };
    };
    id: string[];
    label: string;
    role: {
      time: string[];
      metric: string[];
    };
    size: number[];
    source: string;
    updated: string;
    value: number[];
    version: string;
  }
  
  export interface CategoryTimePoint {
    date: Date;
    timeLabel: string;
    value: number;
  }
  
  export interface CategoryTimeSeries {
    categoryCode: string;
    categoryName: string;
    timePoints: CategoryTimePoint[];
  }
  
  export interface FlattenedDataPoint {
    categoryCode: string;
    categoryName: string;
    date: Date;
    timeLabel: string;
    timeIndex: number;
    value: number; 
  }
  
  export interface TransformedKPIData {
    byCategory: CategoryTimeSeries[];
    flattened: FlattenedDataPoint[];
    timespan: {
      start: Date;
      end: Date;
    };
    metadata: {
      title: string;
      source: string;
      updated: string;
    };
  }