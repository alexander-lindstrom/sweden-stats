import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import '../../StateEconomy/css/Tooltip.css';

import { HierarchyDataNode } from './types';
import { hideTooltip, setupTooltip, showTooltip } from '../util/Tooltip';

interface BarChartProps {
  data: HierarchyDataNode[];
  levelColorScale: d3.ScaleOrdinal<string, string>;
  width: number;
  height: number;
  onBarClick: (node: HierarchyDataNode) => void;
}

const LABEL_MAX_LENGTH = 25;

const truncateLabel = (text: string, maxLength: number): string => {
    if (text.length <= maxLength) {
        return text;
    }
    return text.slice(0, maxLength) + '...';
};

export const BarChart: React.FC<BarChartProps> = ({
  data,
  levelColorScale,
  width,
  height,
  onBarClick,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const margin = { top: 20, right: 30, bottom: 40, left: 150 };
  const adjustedWidth = width - margin.left - margin.right;
  const adjustedHeight = height - margin.top - margin.bottom;


  useEffect(() => {
    if (!svgRef.current || !data) return;
    setupTooltip();

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const chart = svg.append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const sortedData = [...data].sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const yScale = d3.scaleBand<string>()
      .domain(sortedData.map(d => d.data.name))
      .range([0, adjustedHeight])
      .padding(0.1);

    const minValue = d3.min(sortedData, d => d.value ?? 0) ?? 0;
    const maxValue = d3.max(sortedData, d => d.value ?? 0) ?? 0;

    const xScale = d3.scaleLinear()
      .domain([Math.min(0, minValue), Math.max(0, maxValue)])
      .range([0, adjustedWidth])
      .nice();

    chart.append("g")
      .call(d3.axisLeft(yScale)
          .tickFormat(d => truncateLabel(d, LABEL_MAX_LENGTH))
          .tickSizeOuter(0)
      );

    chart.append("g")
      .attr("transform", `translate(0,${adjustedHeight})`)
      .call(d3.axisBottom(xScale));

    if (minValue < 0 && maxValue > 0) {
      chart.append("line")
        .attr("x1", xScale(0))
        .attr("x2", xScale(0))
        .attr("y1", 0)
        .attr("y2", adjustedHeight)
        .attr("stroke", "grey")
        .attr("stroke-dasharray", "2,2");
    }


    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const bars = chart.selectAll(".bar")
      .data(sortedData, (d: unknown) => (d as HierarchyDataNode).data.name)
      .join("rect")
        .attr("class", "bar")
        .attr("y", d => yScale(d.data.name)!)
        .attr("height", yScale.bandwidth())
        .attr("fill", d => levelColorScale(d.data.name))
        .attr("x", d => xScale(Math.min(0, d.value ?? 0)))
        .attr("width", d => Math.abs(xScale(d.value ?? 0) - xScale(0)))
        .style("cursor", d => (d.children && d.children.length > 0 ? "pointer" : "default"))
        .on("click", (_event, d) => {
          if (d.children && d.children.length > 0) {
            onBarClick(d);
          }
        })
        .on("mouseover", (event, d) => {
            d3.select(event.currentTarget).attr("fill-opacity", 0.7);

            const roundedValue = Math.round(d.value ?? 0);
            const tooltipContent = `<strong>${d.data.name}</strong><br/>Value: ${roundedValue.toLocaleString()}`;

            showTooltip(event, tooltipContent);
        })
        .on("mouseout", (event) => {
            d3.select(event.currentTarget).attr("fill-opacity", 1);
            hideTooltip();
        });

    chart.selectAll(".bar-label")
      .data(sortedData, (d: unknown) => (d as HierarchyDataNode).data.name)
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
        .text(d => Math.round(d.value ?? 0).toLocaleString());

  }, [data, width, height, margin, adjustedWidth, adjustedHeight, onBarClick, levelColorScale]);

  return (
    <svg ref={svgRef} width={width} height={height}></svg>
  );
};