import { CategoryTimePoint, CategoryTimeSeries, FlattenedDataPoint, KPIApiResponse, TransformedKPIData } from "./types";

export function transformKPIData(apiData: KPIApiResponse): TransformedKPIData {
  const categoryLabels = apiData.dimension.VaruTjanstegrupp.category.label;
  const timeIndices = apiData.dimension.Tid.category.index;
  const values = apiData.value;
  const categoryCount = apiData.size[0];
  
  // Process time information from the API
  const timeKeys = Object.keys(timeIndices);
  const sortedTimeKeys = timeKeys.sort((a, b) => timeIndices[a] - timeIndices[b]);
  
  // Parse the date strings into Date objects
  const dateSeries: Date[] = sortedTimeKeys.map(timeKey => {
    // Format is YYYYMXX where YYYY is year, M is a literal 'M', and XX is month number
    const year = parseInt(timeKey.substring(0, 4), 10);
    const month = parseInt(timeKey.substring(5, 7), 10) - 1; // JavaScript months are 0-indexed
    return new Date(year, month, 1);
  });
  
  // Create category time series
  const byCategory: CategoryTimeSeries[] = [];
  
  Object.entries(categoryLabels).forEach(([categoryCode, categoryName]) => {
    const categoryIndex = parseInt(categoryCode, 10) - 1;
    if (categoryIndex < 0 || categoryIndex >= categoryCount) return;
    
    const timePoints: CategoryTimePoint[] = [];
    
    // For each time point
    sortedTimeKeys.forEach((timeKey, timeIndex) => {
      const valueIndex = categoryIndex + (timeIndices[timeKey] * categoryCount);
      
      if (valueIndex < values.length) {
        timePoints.push({
          date: dateSeries[timeIndex],
          timeLabel: timeKey,
          value: values[valueIndex]
        });
      }
    });
    
    byCategory.push({
      categoryCode,
      categoryName,
      timePoints
    });
  });
  
  // Create flattened data format (best for most D3 visualizations)
  const flattened: FlattenedDataPoint[] = [];
  
  Object.entries(categoryLabels).forEach(([categoryCode, categoryName]) => {
    const categoryIndex = parseInt(categoryCode, 10) - 1;
    if (categoryIndex < 0 || categoryIndex >= categoryCount) return;
    
    // For each time point
    sortedTimeKeys.forEach((timeKey, timeIndex) => {
      const valueIndex = categoryIndex + (timeIndices[timeKey] * categoryCount);
      
      if (valueIndex < values.length) {
        flattened.push({
          categoryCode,
          categoryName,
          date: dateSeries[timeIndex],
          timeLabel: timeKey,
          timeIndex: timeIndices[timeKey],
          value: values[valueIndex]
        });
      }
    });
  });
  
  return {
    byCategory,
    flattened,
    timespan: {
      start: dateSeries[0],
      end: dateSeries[dateSeries.length - 1]
    },
    metadata: {
      title: apiData.label,
      source: apiData.source,
      updated: apiData.updated
    }
  };
}