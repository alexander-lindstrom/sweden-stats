import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

import '../../StateEconomy/css/Tooltip.css';
import { DataNode, HierarchyDataNode } from './types';
import { hideTooltip, setupTooltip, showTooltip } from '../util/Tooltip';

interface SunburstChartProps {
    rootNode: HierarchyDataNode;
    hierarchyData: HierarchyDataNode; // <-- DEFINE PROP TYPE
    colorScale: d3.ScaleOrdinal<string, string>;
    width: number;
    height: number;
    onArcClick: (node: HierarchyDataNode) => void;
  }

export const SunburstChart: React.FC<SunburstChartProps> = ({
    rootNode,
    hierarchyData,
    colorScale,
    width,
    height,
    onArcClick,
  }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const radius = Math.min(width, height) / 2 * 0.9;
  
    // Function to get a consistent color based on top-level ancestor
    const getColor = (d: HierarchyDataNode): string => {
      let current: HierarchyDataNode | null = d;
      while (current?.parent && current.parent !== rootNode.parent) {
        if (current.parent === hierarchyData) break;
        current = current.parent;
        if (!current?.parent) break;
      }
      if (d.parent === hierarchyData) {
        return colorScale(d.data.name);
      }
      return colorScale(current?.data.name || d.data.name);
    };
  
    useEffect(() => {
      setupTooltip();
      if (!svgRef.current || !rootNode) return;
  
      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();
  
      const g = svg.append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);
  
      // Create a copy of the rootNode with reset depth values
      // This is the key fix - we create a new hierarchy where the focused node becomes depth 0
      const resetHierarchy = d3.hierarchy(rootNode.data)
        .sum(d => Math.abs(d.value || 0));
  
      // Define the partition layout
      const partition = d3.partition<DataNode>()
        .size([2 * Math.PI, radius]);
  
      // Apply the partition layout to our reset hierarchy
      const partitionedRoot = partition(resetHierarchy);
  
      // Find the current center node in the partitioned data
      const centerData = partitionedRoot;
  
      // Define the arc generator
      const arc = d3.arc<d3.HierarchyRectangularNode<DataNode>>()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .innerRadius(d => Math.max(0, d.y0))
        .outerRadius(d => Math.max(0, d.y1 - 1));
  
      // Draw the arcs
      const path = g.append("g")
        .selectAll("path")
        .data(partitionedRoot.descendants().filter(d => d.depth > 0 || d === partitionedRoot))
        .join("path")
          .attr("d", arc)
          .attr("fill", d => getColor(d))
          .attr("fill-opacity", d => (d === centerData || !d.children) ? 0.8 : 0.6)
          .style("cursor", d => (d.children || d === centerData && d.parent) ? "pointer" : "default")
          .on("click", (event, d) => {
            event.stopPropagation();
            
            // Map from the visual node back to the original data structure for proper navigation
            let targetNode;
            
            // Handle "zoom out" when clicking center
            if (d === centerData && rootNode.parent) {
              targetNode = rootNode.parent;
            } 
            // Handle "zoom in" when clicking on children
            else if (d.children) {
              // Find the corresponding node in the original hierarchy
              targetNode = findNodeByPath(hierarchyData, getNodePath(d, resetHierarchy));
            }
            
            if (targetNode) {
              onArcClick(targetNode);
            }
          })
          .on("mouseover", (event, d) => {
            path.filter(node => node === d).attr("fill-opacity", 1);
        
            let valueToShow: number | undefined | null;
            let valueLabel = "Value";
        
            if (!d.children && d.data.value !== undefined) {
              valueToShow = d.data.value;
            } else if (d.children) {
              valueToShow = d.value;
              valueLabel = "Sum of Magnitudes";
            } else {
              valueToShow = d.value;
              valueLabel = "Aggregated Value";
            }
        
            const tooltipContent = `<strong>${d.data.name}</strong><br/>${valueLabel}: ${valueToShow?.toLocaleString() ?? 'N/A'}`;
            showTooltip(event, tooltipContent);
          })
          .on("mouseout", (_event, d) => {
            path.filter(node => node === d).attr("fill-opacity", (node => (node === centerData || !node.children) ? 0.8 : 0.6));
            hideTooltip();
          });
  
      return () => {
        hideTooltip();
      };
    }, [rootNode, width, height, colorScale, onArcClick, radius, hierarchyData]);
  
    // Helper function to get a path from root to node (array of names)
    const getNodePath = (node: d3.HierarchyRectangularNode<DataNode>, root: d3.HierarchyRectangularNode<DataNode>): string[] => {
      const path: string[] = [];
      let current: d3.HierarchyRectangularNode<DataNode> | null = node;
      
      while (current && current !== root) {
        path.unshift(current.data.name);
        current = current.parent;
      }
      
      return path;
    };
    
    // Helper function to find a node in the original hierarchy by following a path of names
    const findNodeByPath = (root: HierarchyDataNode, path: string[]): HierarchyDataNode | undefined => {
      let current: HierarchyDataNode | null = root;
      
      for (const name of path) {
        if (!current || !current.children) return undefined;
        
        current = current.children.find(child => child.data.name === name) || null;
        if (!current) return undefined;
      }
      
      return current;
    };
  
    return (
      <svg ref={svgRef} width={width} height={height}></svg>
    );
  }