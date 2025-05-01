import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

import '../../StateEconomy/css/Tooltip.css';
import { DataNode, HierarchyDataNode } from './types';

interface SunburstChartProps {
    rootNode: HierarchyDataNode;
    hierarchyData: HierarchyDataNode; // <-- DEFINE PROP TYPE
    colorScale: d3.ScaleOrdinal<string, string>;
    width: number;
    height: number;
    onArcClick: (node: HierarchyDataNode) => void;
  }

// Simple Tooltip State (could be more complex)
let tooltipDiv: HTMLDivElement | null = null;

const setupTooltip = () => {
    if (!tooltipDiv) {
        tooltipDiv = document.createElement('div');
        tooltipDiv.className = 'chart-tooltip';
        document.body.appendChild(tooltipDiv);
    }
};

const showTooltip = (event: MouseEvent, content: string) => {
    if (!tooltipDiv) return;
    tooltipDiv.style.opacity = '1';
    tooltipDiv.style.left = `${event.pageX + 10}px`;
    tooltipDiv.style.top = `${event.pageY + 10}px`;
    tooltipDiv.innerHTML = content;
};

const hideTooltip = () => {
    if (!tooltipDiv) return;
    tooltipDiv.style.opacity = '0';
};


export const SunburstChart: React.FC<SunburstChartProps> = ({
    rootNode,
    hierarchyData, // <-- DESTRUCTURE PROP
    colorScale,
    width,
    height,
    onArcClick,
  }) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const radius = Math.min(width, height) / 2 * 0.9; // Adjust radius calculation as needed

  console.log(hierarchyData, rootNode)

  // Function to get a consistent color based on top-level ancestor
  const getColor = (d: HierarchyDataNode): string => {
      let current: HierarchyDataNode | null = d;
      while (current?.parent && current.parent !== rootNode.parent) { // Go up until top level under root's parent
           if(current.parent === hierarchyData) break; // Stop if we reach the absolute root if needed
           current = current.parent;
           if (!current?.parent) break; // Stop if we hit the very top
      }
       // If the node *is* a child of the absolute root, use its name directly
      if (d.parent === hierarchyData) {
         return colorScale(d.data.name);
      }
      // Otherwise, use the ancestor's name found above
      return colorScale(current?.data.name || d.data.name); // Fallback to own name
  };


  useEffect(() => {
      setupTooltip();
      if (!svgRef.current || !rootNode) return;

      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove(); // Clear previous render

      const g = svg.append("g")
                   .attr("transform", `translate(${width / 2},${height / 2})`);

      // Define the partition layout
      const partition = d3.partition<DataNode>()
                          .size([2 * Math.PI, radius]); // Angle, Radius

      // Define the arc generator
      // Use Math.abs(d.value) for radius/angle if negative values shouldn't shrink segments visually
      // However, d3.partition uses value for angle, so summing abs value earlier might be better.
      const arc = d3.arc<d3.HierarchyRectangularNode<DataNode>>()
                    .startAngle(d => d.x0)
                    .endAngle(d => d.x1)
                    .innerRadius(d => Math.max(0, d.y0)) // Ensure inner radius isn't negative
                    .outerRadius(d => Math.max(0, d.y1 - 1)); // Ensure outer radius > inner, -1 for spacing

      // Apply the partition layout
      const partitionedRoot = partition(rootNode);

       // Select the node corresponding to the current root for the center circle
       const centerData = partitionedRoot.descendants().find(d => d.data === rootNode.data);


      // Draw the arcs
      const path = g.append("g")
        .selectAll("path")
        .data(partitionedRoot.descendants().filter(d => d.depth > 0 || d === partitionedRoot )) // Filter out root if desired, or style it differently
        .join("path")
          .attr("d", arc)
          .attr("fill", d => getColor(d)) // Use the consistent color function
          .attr("fill-opacity", d => (d === centerData || !d.children) ? 0.8 : 0.6) // Example: Highlight center/leaves
          .style("cursor", d => (d.children || d === centerData && d.parent) ? "pointer" : "default") // Pointer cursor for clickable items
          .on("click", (event, d) => {
              event.stopPropagation(); // Prevent triggering clicks on parent elements
               // If clicked node is the center and has a parent, zoom out
               if (d === centerData && d.parent) {
                   onArcClick(d.parent);
               }
               // If clicked node has children, zoom in
               else if (d.children) {
                  onArcClick(d);
              }
              // Do nothing if it's a leaf node (and not the center eligible for zoom out)
          })
          .on("mouseover", (event, d) => {
            path.filter(node => node === d).attr("fill-opacity", 1); // Highlight
        
            let valueToShow: number | undefined | null;
            let valueLabel = "Value";
        
            // For leaf nodes, show the original value from the data
            if (!d.children && d.data.value !== undefined) {
                valueToShow = d.data.value;
            }
            // For parent nodes, d.value is the result of the .sum() operation
            // Since we summed absolute values, clarify this.
            else if (d.children) {
                valueToShow = d.value; // This is the sum of absolute values
                valueLabel = "Sum of Magnitudes"; // Clarify what the summed value means
                // Optional: You could recalculate the *actual* signed sum here if needed
                // const actualSum = d.leaves().reduce((acc, leaf) => acc + (leaf.data.value || 0), 0);
                // tooltipContent += `<br/>Net Sum: ${actualSum?.toLocaleString()}`;
            } else {
                 // Nodes without children AND without d.data.value (purely structural)
                 valueToShow = d.value; // Might be 0 if summing abs value
                 valueLabel = "Aggregated Value";
            }
        
        
            const tooltipContent = `<strong><span class="math-inline">${d.data.name}</strong><br/></span>${valueLabel}: ${valueToShow?.toLocaleString() ?? 'N/A'}`;
            showTooltip(event, tooltipContent);
        })
          .on("mouseout", (_event, d) => {
               path.filter(node => node === d).attr("fill-opacity", (node => (node === centerData || !node.children) ? 0.8 : 0.6)); // Restore opacity
               hideTooltip();
          });

       // Add a center circle element explicitly? Could be used for zoom out click.
       // Could style the center arc (d === centerData) specially instead.

      // Cleanup tooltip on component unmount
      return () => {
          hideTooltip();
          // Optional: remove tooltipDiv from body if this is the last chart using it
          // if (tooltipDiv && !document.querySelector('.chart-tooltip')) {
          //      tooltipDiv.remove();
          //      tooltipDiv = null;
          // }
      };

  }, [rootNode, width, height, colorScale, onArcClick, radius]); // Dependencies

  return (
    <svg ref={svgRef} width={width} height={height}></svg>
  );
};