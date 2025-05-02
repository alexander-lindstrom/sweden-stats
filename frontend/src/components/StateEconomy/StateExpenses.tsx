import React, { useState, useMemo, useCallback, useEffect } from 'react';
import * as d3 from 'd3';

import './css/StateExpenses.css';
import { DataNode, HierarchyDataNode } from '../charts/SunburstWithBar/types';
import { BarChart } from '../charts/SunburstWithBar/Bar';
import { SunburstChart } from '../charts/SunburstWithBar/Sunburst';
import { fetchAllExpenses } from '@/api/StateExpensesApi';
import YearSlider from './YearSlider';

export const DashboardComponent: React.FC = () => {
  const [expensesData, setExpensesData] = useState<Record<string, DataNode> | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  // Fetch once on load
  useEffect(() => {
    fetchAllExpenses()
      .then(data => {
        setExpensesData(data);
        const years = Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b));
        if (years.length > 0) {
          setSelectedYear(years[years.length - 1]);
        }
      })
      .catch(err => {
        console.error("Failed to load expenses data:", err);
        setError("Failed to load expenses data");
      });
  }, []);

  // Available years
  const years = useMemo(() => {
    return expensesData ? Object.keys(expensesData).sort((a, b) => parseInt(a) - parseInt(b)) : [];
  }, [expensesData]);

  // Get raw data for selected year
  const fullData = useMemo(() => {
    return selectedYear && expensesData ? expensesData[selectedYear] : null;
  }, [selectedYear, expensesData]);

  // Convert to d3.hierarchy
  const hierarchyData = useMemo(() => {
    if (!fullData) return null;
    return d3.hierarchy(fullData)
      .sum((d) => Math.abs(d.value || 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [fullData]);

  // Zooming state
  const [currentRootNode, setCurrentRootNode] = useState<HierarchyDataNode | null>(null);

  // Reset zoom when data changes
  useEffect(() => {
    if (hierarchyData) {
      setCurrentRootNode(hierarchyData);
    }
  }, [hierarchyData]);

  // Color scale based on top-level categories
  const colorScale = useMemo(() => {
    const topLevelNames = hierarchyData?.children?.map(d => d.data.name) || [];
    return d3.scaleOrdinal<string>()
      .domain(topLevelNames)
      .range(d3.schemeCategory10);
  }, [hierarchyData]);

  const handleZoom = useCallback((node: HierarchyDataNode | null) => {
    if (!node || !hierarchyData) return;
    if (node !== currentRootNode) {
      setCurrentRootNode(node);
    } else if (node === currentRootNode && node.parent) {
      setCurrentRootNode(node.parent);
    }
  }, [currentRootNode, hierarchyData]);

  const barChartData = useMemo(() => {
    return currentRootNode?.children || [];
  }, [currentRootNode]);

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  if (!expensesData || !selectedYear || !hierarchyData || !currentRootNode) {
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="dashboard-container">
      <div className="controls">
        <h2>Statens utgifter per kategori ({selectedYear})</h2>
        <div className="year-slider">
          <YearSlider 
            years={years} 
            selectedYear={selectedYear} 
            onYearChange={setSelectedYear} 
          />
        </div>
      </div>

      <div className="chart-wrapper sunburst-wrapper">
        <h3>Sunburst View ({currentRootNode.data.name})</h3>
        {currentRootNode !== hierarchyData && (
          <button onClick={() => setCurrentRootNode(hierarchyData)}>Reset Zoom</button>
        )}
        <button onClick={() => currentRootNode.parent && handleZoom(currentRootNode.parent)}>
          Zoom Out
        </button>
        <SunburstChart
          rootNode={currentRootNode}
          hierarchyData={hierarchyData}
          colorScale={colorScale}
          width={400}
          height={400}
          onArcClick={handleZoom}
        />
      </div>

      <div className="chart-wrapper barchart-wrapper">
        <h3>Breakdown for {currentRootNode.data.name}</h3>
        <BarChart
          data={barChartData}
          colorScale={colorScale}
          width={500}
          height={400}
        />
      </div>

      <div className="source-info">
        Källa: ESV<br />
        Uppdaterad: 2025
      </div>
    </div>
  );
};
