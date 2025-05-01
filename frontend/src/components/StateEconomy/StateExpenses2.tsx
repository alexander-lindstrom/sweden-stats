import React, { useState, useMemo, useCallback } from 'react';
import * as d3 from 'd3';

import './css/StateExpenses.css';
import { DataNode, HierarchyDataNode } from '../charts/SunburstV2/types';
import { BarChart } from '../charts/SunburstV2/Bar';
import { sampleData } from '../charts/SunburstV2/SampleData';
import { SunburstChart } from '../charts/SunburstV2/Sunburst';

export const DashboardComponent: React.FC = () => {
  const [fullData] = useState<DataNode>(sampleData); // Load your data here

  // Calculate the hierarchy and sum values ONCE.
  // Decide how to handle negative values in the sum. Using Math.abs for size representation is common.
  const hierarchyData = useMemo(() => {
    return d3.hierarchy(fullData)
             // IMPORTANT: Sum the absolute values for layout purposes
             .sum((d) => Math.abs(d.value || 0))
             // Optional: Sort based on the absolute value if desired, or remove sort
             .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
  }, [fullData]);

  const [currentRootNode, setCurrentRootNode] = useState<HierarchyDataNode>(hierarchyData);

  // Define the color scale
  const colorScale = useMemo(() => {
    // Color by top-level category name for consistency
    const topLevelNames = (hierarchyData.children || []).map(d => d.data.name);
    return d3.scaleOrdinal<string>()
            .domain(topLevelNames)
            .range(d3.schemeCategory10); // Or your preferred color scheme
  }, [hierarchyData]);

  // Callback for handling zoom/navigation from the sunburst
  const handleZoom = useCallback((node: HierarchyDataNode | null) => {
      // If null is passed (e.g., clicking background?), maybe reset to root?
      // Or only update if node is valid and different from current root.
      if (node && node !== currentRootNode) {
          setCurrentRootNode(node);
      } else if (!node && hierarchyData) { // Example: reset if null is passed
          setCurrentRootNode(hierarchyData);
      }
       // If the clicked node is the *same* as the current root, try to zoom out
       else if (node === currentRootNode && node.parent) {
         setCurrentRootNode(node.parent);
       }
      // Add logic: don't zoom into leaves? Check if node.children exists before setting?
      // This depends on the exact behaviour desired when clicking leaves.
      // The SunburstChart's internal click handler should manage this logic primarily.
  }, [currentRootNode, hierarchyData]);


  const barChartData = useMemo(() => {
    // Pass only the direct children of the current root to the bar chart
    return currentRootNode.children || [];
  }, [currentRootNode]);

  return (
    <div className="dashboard-container">
      <div className="chart-wrapper sunburst-wrapper">
        <h2>Sunburst View ({currentRootNode.data.name})</h2>
        {/* Optional: Add a button to explicitly zoom out / reset */}
        {currentRootNode !== hierarchyData && (
             <button onClick={() => handleZoom(hierarchyData)}>Reset Zoom</button>
        )}
        <button onClick={() => currentRootNode.parent && handleZoom(currentRootNode.parent)}>Zoom Out</button>
        <SunburstChart
            rootNode={currentRootNode}
            hierarchyData={hierarchyData} // <-- PASS THE PROP HERE
            colorScale={colorScale}
            width={400} // Ensure these are > 0
            height={400} // Ensure these are > 0
            onArcClick={handleZoom}
        />
      </div>
      <div className="chart-wrapper barchart-wrapper">
        <h2>Breakdown for {currentRootNode.data.name}</h2>
        <BarChart
          data={barChartData} // Pass the children data
          colorScale={colorScale}
          width={500}
          height={400}
        />
      </div>
    </div>
  );
};