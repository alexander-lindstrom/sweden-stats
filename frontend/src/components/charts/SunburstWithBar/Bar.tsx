import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import '../../StateEconomy/css/Tooltip.css';

import { HierarchyDataNode } from './types';
import { hideTooltip, setupTooltip, showTooltip } from '../util/Tooltip';

interface BarChartProps {
  data: HierarchyDataNode[]; // Expecting array of children nodes
  colorScale: d3.ScaleOrdinal<string, string>;
  width: number;
  height: number;
  onBarClick: (node: HierarchyDataNode) => void; // <-- ADDED: Callback for clicking a bar
}

const LABEL_MAX_LENGTH = 20; // Define max length for truncation

// Helper function for truncation
const truncateLabel = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) {
        return text;
    }
    return text.slice(0, maxLength) + '...';
};

export const BarChart: React.FC<BarChartProps> = ({
  data,
  colorScale,
  width,
  height,
  onBarClick, // <-- ADDED: Destructure prop
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const margin = { top: 20, right: 30, bottom: 40, left: 150 }; // Adjust left margin for labels
  const adjustedWidth = width - margin.left - margin.right;
  const adjustedHeight = height - margin.top - margin.bottom;

  // Function to get a consistent color (similar to sunburst)
  const getColor = (d: HierarchyDataNode): string => {
    let current: HierarchyDataNode | null = d;
    // Find the top-level ancestor *under the absolute root*
    while (current?.parent && current.parent.depth > 0) {
      current = current.parent;
    }
    return colorScale(current?.data.name || d.data.name); // Fallback to own name
  };


  useEffect(() => {
    if (!svgRef.current || !data) return;
    setupTooltip();

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    const chart = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    // Sort data (e.g., descending value)
    const sortedData = [...data].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    // --- Scales ---
    // Y Scale (Band scale for names)
    const yScale = d3.scaleBand<string>() // Specify string type for domain
      .domain(sortedData.map(d => d.data.name))
      .range([0, adjustedHeight])
      .padding(0.1);

    // X Scale (Linear scale for values, handling negatives)
    const minValue = d3.min(sortedData, d => d.value ?? 0) ?? 0;
    const maxValue = d3.max(sortedData, d => d.value ?? 0) ?? 0;

    const xScale = d3.scaleLinear()
      .domain([Math.min(0, minValue), Math.max(0, maxValue)])
      .range([0, adjustedWidth])
      .nice(); // Makes the axis end on nice round values

    // --- Axes ---
    // Y Axis (Labels)
    chart.append("g")
      .call(d3.axisLeft(yScale)
          // APPLY TRUNCATION to displayed tick labels
          .tickFormat(d => truncateLabel(d, LABEL_MAX_LENGTH))
          .tickSizeOuter(0)
      );

    // X Axis (Values)
    chart.append("g")
      .attr("transform", `translate(0,${adjustedHeight})`)
      .call(d3.axisBottom(xScale));

    // Line at X=0 if domain includes negative numbers
    if (minValue < 0 && maxValue > 0) {
      chart.append("line")
        .attr("x1", xScale(0))
        .attr("x2", xScale(0))
        .attr("y1", 0)
        .attr("y2", adjustedHeight)
        .attr("stroke", "grey")
        .attr("stroke-dasharray", "2,2");
    }


    // --- Bars ---
    const bars = chart.selectAll(".bar")
      .data(sortedData, (d: HierarchyDataNode) => d.data.name)
      .join("rect")
        .attr("class", "bar")
        .attr("y", d => yScale(d.data.name)!)
        .attr("height", yScale.bandwidth())
        .attr("fill", d => getColor(d))
        .attr("x", d => xScale(Math.min(0, d.value ?? 0)))
        .attr("width", d => Math.abs(xScale(d.value ?? 0) - xScale(0)))
        .style("cursor", d => (d.children && d.children.length > 0 ? "pointer" : "default"))
        .on("click", (_event, d) => {
          if (d.children && d.children.length > 0) {
            onBarClick(d);
          }
        })
        // --- ADDED: Tooltip Handlers ---
        .on("mouseover", (event, d) => {
            // Highlight bar slightly on hover
            d3.select(event.currentTarget).attr("fill-opacity", 0.7);

            // Prepare tooltip content: Full Name + Rounded Value
            const roundedValue = Math.round(d.value ?? 0);
            const tooltipContent = `<strong>${d.data.name}</strong><br/>Value: ${roundedValue.toLocaleString()}`; // Use localeString for formatting

            // Show tooltip using imported function
            showTooltip(event, tooltipContent);
        })
        .on("mouseout", (event) => {
            // Reset bar highlight
            d3.select(event.currentTarget).attr("fill-opacity", 1);

            // Hide tooltip using imported function
            hideTooltip();
        });
      
    // --- END ADDED ---


    // --- Value Labels (Optional) ---
    chart.selectAll(".bar-label")
      .data(sortedData, (d: HierarchyDataNode) => d.data.name)
      .join("text")
        .attr("class", "bar-label")
        .attr("y", d => yScale(d.data.name)! + yScale.bandwidth() / 2)
        .attr("dy", "0.35em")
        .attr("font-size", "10px")
        .attr("fill", "black")
        .attr("x", d => {
          const val = d.value ?? 0;
          const space = 5;
          return val >= 0 ? xScale(val) + space : xScale(val) - space;
        })
        .attr("text-anchor", d => (d.value ?? 0) >= 0 ? "start" : "end")
        // --- MODIFIED: Round the displayed value ---
        .text(d => Math.round(d.value ?? 0).toLocaleString()); // Round and format


    // Add transitions for updates later if needed (use d3-transition)

  }, [data, width, height, colorScale, margin, adjustedWidth, adjustedHeight, onBarClick]); // <-- ADDED: onBarClick to dependencies

  return (
    <svg ref={svgRef} width={width} height={height}></svg>
  );
};