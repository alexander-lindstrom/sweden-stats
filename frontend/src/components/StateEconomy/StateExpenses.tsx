import React, { useState, useMemo, useCallback, useEffect } from 'react';
import * as d3 from 'd3';

import './css/StateExpenses.css';
import { DataNode, HierarchyDataNode } from '../charts/sunBurstWithBar/types';
import { BarChart } from '../charts/sunBurstWithBar/Bar';
import { SunburstChart } from '../charts/sunBurstWithBar/Sunburst';
import { fetchAllExpenses } from '@/api/StateExpensesApi';
import YearSlider from './YearSlider';

export const DashboardComponent: React.FC = () => {
  const [expensesData, setExpensesData] = useState<Record<string, DataNode> | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

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

  const years = useMemo(() => {
    return expensesData ? Object.keys(expensesData).sort((a, b) => parseInt(a) - parseInt(b)) : [];
  }, [expensesData]);

  const fullData = useMemo(() => {
    return selectedYear && expensesData ? expensesData[selectedYear] : null;
  }, [selectedYear, expensesData]);

  const hierarchyData = useMemo(() => {
    if (!fullData) return null;
    return d3.hierarchy(fullData)
      .sum((d) => (d.value && d.value > 0) ? d.value : 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [fullData]);

  const [currentRootNode, setCurrentRootNode] = useState<HierarchyDataNode | null>(null);

  useEffect(() => {
    if (hierarchyData) {
      setCurrentRootNode(hierarchyData);
    }
  }, [hierarchyData]);

  const levelColorScale = useMemo(() => {
    if (!currentRootNode || !currentRootNode.children) {
      return d3.scaleOrdinal<string, string>();
    }
    const currentChildrenNames = currentRootNode.children.map(d => d.data.name);
    const colorScale = d3.scaleOrdinal<string, string>()
      .domain(currentChildrenNames)
      .range(currentChildrenNames.map((_, i) => d3.interpolateRainbow(i / currentChildrenNames.length)));
  
    return colorScale;
  }, [currentRootNode]);  

  const handleSunburstZoom = useCallback((node: HierarchyDataNode | null) => {
    if (!node) return;
    setCurrentRootNode(node);
  }, []);

  const handleBarClick = useCallback((node: HierarchyDataNode) => {
    setCurrentRootNode(node);
  }, []);

  const handleZoomOut = useCallback(() => {
    if (hierarchyData) {
      setCurrentRootNode(hierarchyData);
    }
  }, [hierarchyData]);

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

      <div className="category-section">
        <div className="category-header">
          <button 
            onClick={handleZoomOut}
            className={`zoom-out-button ${currentRootNode === hierarchyData ? 'disabled' : ''}`}
            title={currentRootNode === hierarchyData ? "Already at root view" : "Zoom out to root view"}
            disabled={currentRootNode === hierarchyData}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
              <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
          </button>
          <h2 className="charts-header">Kategori: {currentRootNode.data.name || 'Total'}</h2>
        </div>
      </div>

      <div className="charts-container">
        <div className="chart-wrapper sunburst-wrapper">
          <SunburstChart
            rootNode={currentRootNode}
            hierarchyData={hierarchyData}
            levelColorScale={levelColorScale}
            width={600}
            height={600}
            onArcClick={handleSunburstZoom}
          />
        </div>

        <div className="chart-wrapper barchart-wrapper">
          <BarChart
            data={barChartData}
            levelColorScale={levelColorScale}
            width={500}
            height={400}
            onBarClick={handleBarClick}
          />
        </div>
      </div>

      <div className="source-info">
        Källa: Ekonomistyrningsverket (ESV) - Statsbudgetens utfall <br />
        Uppdaterad: 2025 <br />
        Kommentar: Potentiella negativa värden visas ej
      </div>
    </div>
  );
};