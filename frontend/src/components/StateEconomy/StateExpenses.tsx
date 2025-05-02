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
      .sum((d) => Math.abs(d.value || 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [fullData]);

  const [currentRootNode, setCurrentRootNode] = useState<HierarchyDataNode | null>(null);

  useEffect(() => {
    if (hierarchyData) {
      setCurrentRootNode(hierarchyData);
    }
  }, [hierarchyData]);


  const levelColorScale = useMemo(() => {
    const colorRange = d3.schemeTableau10;
    if (!currentRootNode || !currentRootNode.children) {
        return d3.scaleOrdinal<string>().range(colorRange);
    }
    const currentChildrenNames = currentRootNode.children.map(d => d.data.name);
    return d3.scaleOrdinal<string>()
        .domain(currentChildrenNames)
        .range(colorRange);
  }, [currentRootNode]);

  const handleSunburstZoom = useCallback((node: HierarchyDataNode | null) => {
    if (!node) return;
     setCurrentRootNode(node);
     
  }, []);

  const handleBarClick = useCallback((node: HierarchyDataNode) => {
    setCurrentRootNode(node);
  }, []);


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
         {currentRootNode.parent && (
           <button onClick={() => currentRootNode.parent && setCurrentRootNode(currentRootNode.parent)}>
             Zoom Out
           </button>
         )}
        <SunburstChart
          rootNode={currentRootNode}
          hierarchyData={hierarchyData}
          levelColorScale={levelColorScale}
          width={400}
          height={400}
          onArcClick={handleSunburstZoom}
        />
      </div>

      <div className="chart-wrapper barchart-wrapper">
        <h3>Breakdown for {currentRootNode.data.name}</h3>
        <BarChart
          data={barChartData}
          levelColorScale={levelColorScale}
          width={500}
          height={400}
          onBarClick={handleBarClick}
        />
      </div>

      <div className="source-info">
        Källa: ESV<br />
        Uppdaterad: 2025
      </div>
    </div>
  );
};