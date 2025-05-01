import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import '../../StateEconomy/css/Tooltip.css'; // Share tooltip styles/logic if needed
import { HierarchyDataNode } from './types';

interface BarChartProps {
  data: HierarchyDataNode[]; // Expecting array of children nodes
  colorScale: d3.ScaleOrdinal<string, string>;
  width: number;
  height: number;
}

export const BarChart: React.FC<BarChartProps> = ({
  data,
  colorScale,
  width,
  height,
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

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // Clear previous render

    const chart = svg.append("g")
                     .attr("transform", `translate(${margin.left},${margin.top})`);

    // Sort data (e.g., descending value)
    const sortedData = [...data].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    // --- Scales ---
    // Y Scale (Band scale for names)
    const yScale = d3.scaleBand()
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
         .call(d3.axisLeft(yScale).tickSizeOuter(0)); // No outer tick line

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
      .data(sortedData, d => d.data.name) // Key function for object constancy
      .join("rect")
        .attr("class", "bar")
        .attr("y", d => yScale(d.data.name)!) // Use non-null assertion or provide fallback
        .attr("height", yScale.bandwidth())
        .attr("fill", d => getColor(d)) // Use consistent color
        // Handle negative values for x and width
        .attr("x", d => xScale(Math.min(0, d.value ?? 0)))
        .attr("width", d => Math.abs(xScale(d.value ?? 0) - xScale(0)));


     // --- Value Labels (Optional) ---
     chart.selectAll(".bar-label")
          .data(sortedData, d => d.data.name)
          .join("text")
             .attr("class", "bar-label")
             .attr("y", d => yScale(d.data.name)! + yScale.bandwidth() / 2) // Center vertically
             .attr("dy", "0.35em") // Vertical alignment adjustment
             .attr("font-size", "10px")
             .attr("fill", "black")
              // Position label based on value sign
             .attr("x", d => {
                 const val = d.value ?? 0;
                 const space = 5; // Pixels space from bar end/start
                 return val >= 0 ? xScale(val) + space : xScale(val) - space;
             })
             .attr("text-anchor", d => (d.value ?? 0) >= 0 ? "start" : "end") // Align text left for positive, right for negative
             .text(d => d.value?.toLocaleString()); // Format value


     // Add transitions for updates later if needed (use d3-transition)

  }, [data, width, height, colorScale, margin, adjustedWidth, adjustedHeight]); // Dependencies

  return (
      <svg ref={svgRef} width={width} height={height}></svg>
  );
};