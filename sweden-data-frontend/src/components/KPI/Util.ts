import { CategoryTimePoint, CategoryTimeSeries, FlattenedDataPoint, KPIApiResponse, TransformedKPIData } from "./KpiTypes";

const getValueIndex = (timeIndex: number, dataPoints: number, categoryIndex: number) => {
  return timeIndex + (categoryIndex - 1) * dataPoints;
}

const getCategoryIndex = (categoryCode: string) => {
  const missingCategories = new Set(['10']);
  const parsed = parseInt(categoryCode, 10);

  let adjustment = 0;
  for (const missing of missingCategories) {
    if (parseInt(missing, 10) < parsed) {
      adjustment++;
    }
  }
  return parsed - adjustment;
};

const capitalizeFirstLetter = (text: string) => {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export function transformKPIData(apiData: KPIApiResponse): TransformedKPIData {
  const categoryLabels = apiData.dimension.VaruTjanstegrupp.category.label;
  const timeIndices = apiData.dimension.Tid.category.index;
  const values = apiData.value;
  const dataPoints = apiData.size[2];
  
  const timeKeys = Object.keys(timeIndices);
  
  const byCategory: CategoryTimeSeries[] = [];
  
  Object.entries(categoryLabels).forEach(([categoryCode, categoryName]) => {
    const categoryIndex = getCategoryIndex(categoryCode);
    
    const timePoints: CategoryTimePoint[] = [];
    
    timeKeys.forEach((timeKey) => {
      const timeIndex = timeIndices[timeKey];
      const valueIndex = getValueIndex(timeIndex, dataPoints, categoryIndex);
      
      if (valueIndex < values.length) {
        timePoints.push({
          date: timeKey,
          timeLabel: timeKey,
          value: values[valueIndex]
        });
      }
    });
    
    byCategory.push({
      categoryCode,
      categoryName: capitalizeFirstLetter(categoryName),
      timePoints
    });
  });
  
  // Create flattened data format (best for most D3 visualizations)
  const flattened: FlattenedDataPoint[] = [];
  
  Object.entries(categoryLabels).forEach(([categoryCode, categoryName]) => {
    const categoryIndex = getCategoryIndex(categoryCode);
    
    // For each time point
    timeKeys.forEach((timeKey) => {
      const timeIndex = timeIndices[timeKey];
      const valueIndex = getValueIndex(timeIndex, dataPoints, categoryIndex);
      
      if (valueIndex < values.length) {
        flattened.push({
          categoryCode,
          categoryName: capitalizeFirstLetter(categoryName),
          date: timeKey,
          timeLabel: timeKey,
          timeIndex: timeIndex,
          value: values[valueIndex]
        });
      }
    });
  });
  
  return {
    byCategory,
    flattened,
    timespan: {
      start: timeKeys[0],
      end: timeKeys[timeKeys.length - 1]
    },
    metadata: {
      title: apiData.label,
      source: apiData.source,
      updated: apiData.updated
    }
  };
}