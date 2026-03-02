import React, { useRef, useEffect } from 'react';
import * as d3 from 'd3';
import '../../StateEconomy/css/Tooltip.css';

import { HierarchyDataNode } from './types';
import { hideTooltip, setupTooltip, showTooltip } from '../util/Tooltip';
import { formatValue } from '../util/Formatting';

interface BarChartProps {
  data: HierarchyDataNode[];
  levelColorScale: d3.ScaleOrdinal<string, string>;
  width: number;
  height: number;
  onBarClick: (node: HierarchyDataNode) => void;
}

const BAR_MARGIN = { top: 20, right: 30, bottom: 40, left: 150 };
const LABEL_MAX_LENGTH = 25;
const MAX_BAR_HEIGHT = 20;
const MAX_BARS = 40;
const BAR_SPACING = 1;
const MIN_BAR_HIT = 10;

const truncateLabel = (text: string, maxLength: number): string => {
  if (text.length <= maxLength) {
      return text;
  }

  const words = text.split(' ');
  let result = '';
  
  for (const word of words) {
      const next = result.length === 0 ? word : result + ' ' + word;
      if (next.length > maxLength) {
          break;
      }
      result = next;
  }

  // If at least one full word fits, return it (no ellipsis)
  if (result.length > 0) {
      return result;
  }

  // If not even one word fits, do a hard truncation with ellipsis
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
  const adjustedWidth = width - BAR_MARGIN.left - BAR_MARGIN.right;
  const adjustedHeight = height - BAR_MARGIN.top - BAR_MARGIN.bottom;


  useEffect(() => {
    if (!svgRef.current || !data) {
      return;
    }
    setupTooltip();

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();

    const chart = svg.append("g")
      .attr("transform", `translate(${BAR_MARGIN.left},${BAR_MARGIN.top})`);

    // Sort and limit the number of bars
    const sortedData = [...data]
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0))
      .slice(0, MAX_BARS);

    // Calculate dynamic padding based on number of bars
    const totalBars = sortedData.length;
    const totalSpacing = (totalBars - 1) * BAR_SPACING;
    const totalBarHeight = totalBars * MAX_BAR_HEIGHT;
    const totalHeight = totalBarHeight + totalSpacing;
    
    // Adjust the height if we have fewer bars
    const effectiveHeight = Math.min(adjustedHeight, totalHeight);
    const dynamicPadding = totalBars > 1 ? BAR_SPACING : 0;

    // Calculate vertical offset to center the bars when there are few of them
    const verticalOffset = (adjustedHeight - effectiveHeight) / 2;

    const yScale = d3.scaleBand<string>()
      .domain(sortedData.map(d => d.data.name))
      .range([verticalOffset, verticalOffset + effectiveHeight])
      .paddingInner(dynamicPadding / MAX_BAR_HEIGHT);

    const minValue = d3.min(sortedData, d => d.value ?? 0) ?? 0;
    const maxValue = d3.max(sortedData, d => d.value ?? 0) ?? 0;

    const xScale = d3.scaleLinear()
      .domain([Math.min(0, minValue), Math.max(0, maxValue)])
      .range([0, adjustedWidth])
      .nice();

    const formatTick = (domainValue: d3.NumberValue) => {
      const value = domainValue.valueOf();
      if (value === 0) {
        return "0";
      }
      return formatValue(value);
    };

    chart.append("g")
      .call(d3.axisLeft(yScale)
          .tickFormat(d => truncateLabel(d, LABEL_MAX_LENGTH))
          .tickSizeOuter(0)
      );

    chart.append("g")
      .attr("transform", `translate(0,${verticalOffset + effectiveHeight})`)
      .call(d3.axisBottom(xScale)
        .tickFormat(formatTick)
        .ticks(5)
      );

    // Add truncation indicator if some bars were removed
    if (data.length > MAX_BARS) {
      chart.append("text")
        .attr("x", adjustedWidth / 2)
        .attr("y", verticalOffset + effectiveHeight + BAR_MARGIN.bottom - 5)
        .attr("text-anchor", "middle")
        .attr("font-size", "12px")
        .attr("fill", "#666")
        .text(`Visar ${MAX_BARS} av ${data.length} kategorier`);
    }

    if (minValue < 0 && maxValue > 0) {
      chart.append("line")
        .attr("x1", xScale(0))
        .attr("x2", xScale(0))
        .attr("y1", verticalOffset)
        .attr("y2", verticalOffset + effectiveHeight)
        .attr("stroke", "grey")
        .attr("stroke-dasharray", "2,2");
    }


     
    const bars = chart.selectAll(".bar")
      .data(sortedData, (d: unknown) => (d as HierarchyDataNode).data.name)
      .join("rect")
        .attr("class", "bar")
        .attr("y", d => yScale(d.data.name)!)
        .attr("height", yScale.bandwidth())
        .attr("fill", d => levelColorScale(d.data.name))
        .attr("x", d => xScale(Math.min(0, d.value ?? 0)))
        .attr("width", d => Math.abs(xScale(d.value ?? 0) - xScale(0)))
        .attr("stroke", "black")
        .attr("stroke-width", "0.5")
        .style("cursor", d => (d.children && d.children.length > 0 ? "pointer" : "default"));

    // Add invisible hit areas for better interaction with thin bars
    chart.selectAll(".bar-hit-area")
      .data(sortedData, (d: unknown) => (d as HierarchyDataNode).data.name)
      .join("rect")
        .attr("class", "bar-hit-area")
        .attr("y", d => yScale(d.data.name)!)
        .attr("height", yScale.bandwidth())
        .attr("fill", "transparent")
        .attr("x", d => xScale(Math.min(0, d.value ?? 0)))
        .attr("width", d => {
          const barWidth = Math.abs(xScale(d.value ?? 0) - xScale(0));
          return Math.max(barWidth, MIN_BAR_HIT);
        })
        .style("cursor", d => (d.children && d.children.length > 0 ? "pointer" : "default"))
        .on("click", (_event, d) => {
          if (d.children && d.children.length > 0) {
            onBarClick(d);
          }
        })
        .on("mouseover", (event, d) => {
            d3.select(event.currentTarget).attr("fill-opacity", 0.1);
            d3.select(event.currentTarget.parentNode)
              .select(`.bar[data-name="${d.data.name}"]`)
              .attr("fill-opacity", 0.7);

            const tooltipContent = `<strong>${d.data.name}</strong><br/>${formatValue(d.value ?? 0)}`;
            showTooltip(event, tooltipContent);
        })
        .on("mouseout", (event, d) => {
            d3.select(event.currentTarget).attr("fill-opacity", 0);
            d3.select(event.currentTarget.parentNode)
              .select(`.bar[data-name="${d.data.name}"]`)
              .attr("fill-opacity", 1);
            hideTooltip();
        });

    bars.attr("data-name", d => d.data.name);

  }, [data, width, height, adjustedWidth, adjustedHeight, onBarClick, levelColorScale]);

  return (
    <div className="w-full max-w-[1100px] mx-auto">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-auto"
      ></svg>
    </div>
  );
};