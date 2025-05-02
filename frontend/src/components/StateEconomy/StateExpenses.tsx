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

  // Reset zoom when data changes (year changes or initial load)
  useEffect(() => {
    if (hierarchyData) {
      setCurrentRootNode(hierarchyData);
    }
  }, [hierarchyData]); // Run when the base hierarchy changes

  // Color scale based on top-level categories
  const colorScale = useMemo(() => {
    // Ensure color scale is based on the *absolute* top level, not the current zoomed level
    const topLevelNames = hierarchyData?.children?.map(d => d.data.name) || [];
    return d3.scaleOrdinal<string>()
      .domain(topLevelNames)
      .range(d3.schemeCategory10);
  }, [hierarchyData]); // Depend on the absolute hierarchy

  // Handler for zooming via Sunburst click
  const handleSunburstZoom = useCallback((node: HierarchyDataNode | null) => {
    if (!node) return; // Should not happen with current Sunburst logic, but safe check
    // If clicking the center node (which represents currentRootNode) and it has a parent, zoom out
    // Note: The sunburst component itself now handles the logic to find the correct parent node
    // So we just need to set the node passed from it.
     setCurrentRootNode(node);
     
  }, []); // setCurrentRootNode is stable

  // --- ADDED: Handler for zooming via Bar Chart click ---
  const handleBarClick = useCallback((node: HierarchyDataNode) => {
    // Bar chart click always means zooming *in*
    setCurrentRootNode(node);
  }, []); // setCurrentRootNode is stable
  // --- END ADDED ---


  const barChartData = useMemo(() => {
    // Always show children of the current root node
    return currentRootNode?.children || [];
  }, [currentRootNode]);

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  // Ensure currentRootNode is set before rendering charts
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
         {/* Pass the correct absolute root */}
        <h3>Sunburst View ({currentRootNode.data.name})</h3>
         {/* Only show Reset Zoom if not already at the top level */}
        {currentRootNode !== hierarchyData && (
           <button onClick={() => setCurrentRootNode(hierarchyData)}>Reset Zoom</button>
         )}
         {/* Only show Zoom Out if there's a parent */}
         {currentRootNode.parent && (
           <button onClick={() => currentRootNode.parent && setCurrentRootNode(currentRootNode.parent)}>
             Zoom Out
           </button>
         )}
        <SunburstChart
          rootNode={currentRootNode}
          hierarchyData={hierarchyData} // Pass the absolute root for color/path finding
          colorScale={colorScale}
          width={400}
          height={400}
          onArcClick={handleSunburstZoom} // Use the specific sunburst handler
        />
      </div>

      <div className="chart-wrapper barchart-wrapper">
        <h3>Breakdown for {currentRootNode.data.name}</h3>
        <BarChart
          data={barChartData}
          colorScale={colorScale}
          width={500}
          height={400}
          onBarClick={handleBarClick} // <-- ADDED: Pass the handler
        />
      </div>

      <div className="source-info">
        Källa: ESV<br />
        Uppdaterad: 2025
      </div>
    </div>
  );
};