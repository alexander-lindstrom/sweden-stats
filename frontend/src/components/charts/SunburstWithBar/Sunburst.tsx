import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';

import { DataNode, HierarchyDataNode } from './types';
import { hideTooltip, setupTooltip, showTooltip } from '../util/Tooltip';

interface SunburstChartProps {
  rootNode: HierarchyDataNode;
  hierarchyData: HierarchyDataNode;
  levelColorScale: d3.ScaleOrdinal<string, string>;
  width: number;
  height: number;
  onArcClick: (node: HierarchyDataNode) => void;
}


export const SunburstChart: React.FC<SunburstChartProps> = ({
  rootNode,
  hierarchyData,
  levelColorScale,
  width,
  height,
  onArcClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const radius = Math.min(width, height) / 2 * 0.9;

  useEffect(() => {
    setupTooltip();
    if (!svgRef.current || !rootNode || !hierarchyData) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const g = svg.append("g")
      .attr("transform", `translate(${width / 2},${height / 2})`);

    const resetHierarchy = d3.hierarchy(rootNode.data)
      .sum(d => Math.abs(d.value || 0))
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const partition = d3.partition<DataNode>()
      .size([2 * Math.PI, radius]);

    const partitionedRoot = partition(resetHierarchy);
    const nodesToDraw = partitionedRoot.descendants();

    const getDynamicArcColor = (
      arcNode: d3.HierarchyRectangularNode<DataNode>,
      dynamicColorScale: d3.ScaleOrdinal<string, string>
  ): string => {
      if (arcNode.depth === 0) {
          return '#e0e0e0'; // Center color
      }
      let ancestorAtDepth1 = arcNode;
      while (ancestorAtDepth1.depth > 1) {
          ancestorAtDepth1 = ancestorAtDepth1.parent!;
      }
      return dynamicColorScale(ancestorAtDepth1.data.name);
  };

    const arc = d3.arc<d3.HierarchyRectangularNode<DataNode>>()
      .startAngle(d => d.x0)
      .endAngle(d => d.x1)
      .innerRadius(d => d.y0 === 0 ? 0 : Math.max(0, d.y0))
      .outerRadius(d => Math.max(0, d.y1 - 1));

    const path = g.append("g")
      .selectAll("path")
      .data(nodesToDraw)
      .join("path")
        .attr("d", arc)
        .attr("fill", d => getDynamicArcColor(d, levelColorScale))
        .attr("fill-opacity", d => (d.depth === 0) ? 0.6 : (d.children ? 0.6 : 0.8))
        .style("cursor", d => (d.children || (d.depth === 0 && rootNode.parent)) ? "pointer" : "default")
        .on("click", (event, d) => {
            event.stopPropagation();

            let targetNode: HierarchyDataNode | null = null;

            if (d.depth === 0 && rootNode.parent) {
                targetNode = rootNode.parent;
            } else if (d.children) {
                 targetNode = rootNode.children?.find(c => c.data.name === d.data.name) ?? null;
                 if (!targetNode) {
                      console.warn("Could not find target node by name match.");
                 }
            }

            if (targetNode) {
                onArcClick(targetNode);
            }
        })
        .on("mouseover", (event, d) => {
             d3.select(event.currentTarget).attr("fill-opacity", 1);

             const roundedValue = Math.round(d.value ?? 0);
             const valueLabel = d.children ? "Aggregated Value" : "Value";
             const tooltipContent = `<strong>${d.data.name}</strong><br/>${valueLabel}: ${roundedValue?.toLocaleString() ?? 'N/A'}`;
             showTooltip(event, tooltipContent);
        })
        .on("mouseout", (event, d) => {
             d3.select(event.currentTarget).attr("fill-opacity", (d.depth === 0) ? 0.6 : (d.children ? 0.6 : 0.8));
             hideTooltip();
        });


    return () => {
      hideTooltip();
    };
  }, [rootNode, hierarchyData, width, height, onArcClick, radius, levelColorScale]);


  return (
    <svg ref={svgRef} width={width} height={height}></svg>
  );
};