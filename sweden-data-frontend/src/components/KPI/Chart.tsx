import React, { useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { FlattenedDataPoint, KPIApiResponse, TransformedKPIData } from './types';
import { transformKPIData } from './Util';


// Props interface for the component
interface CPIChartProps {
  apiData: KPIApiResponse;
  width?: number;
  height?: number;
  margin?: { top: number; right: number; bottom: number; left: number };
}

const CPIChart: React.FC<CPIChartProps> = ({
  apiData,
  width = 900,
  height = 500,
  margin = { top: 40, right: 150, bottom: 60, left: 70 }
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [transformedData, setTransformedData] = useState<TransformedKPIData | null>(null);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [timeRange, setTimeRange] = useState<[Date, Date] | null>(null);
  const [hoveredPoint, setHoveredPoint] = useState<FlattenedDataPoint | null>(null);
  
  // Color scale for categories
  const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
  
  // Transform data on component mount or when apiData changes
  useEffect(() => {
    const data = transformKPIData(apiData);
    setTransformedData(data);
    
    // Initialize all categories as active
    const categories = new Set<string>();
    data.byCategory.forEach(cat => categories.add(cat.categoryCode));
    setActiveCategories(categories);
    
    // Set initial time range to the full range
    setTimeRange([data.timespan.start, data.timespan.end]);
  }, [apiData]);
  
  // Create or update chart when data or dimensions change
  useEffect(() => {
    if (!transformedData || !svgRef.current) return;
    
    const svg = d3.select(svgRef.current);
    
    // Clear existing elements
    svg.selectAll('*').remove();
    
    // Chart dimensions
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    
    // Add chart group
    const chart = svg
      .append('g')
      .attr('transform', `translate(${margin.left}, ${margin.top})`);
    
    // Filter data by active categories and time range
    const filteredData = transformedData.flattened.filter(d => 
      activeCategories.has(d.categoryCode) && 
      (!timeRange || (d.date >= timeRange[0] && d.date <= timeRange[1]))
    );
    
    // Group data by category
    const dataByCategory = Array.from(d3.group(filteredData, d => d.categoryCode), 
      ([key, values]) => ({
        categoryCode: key,
        categoryName: values[0].categoryName,
        values: values.sort((a, b) => a.date.getTime() - b.date.getTime())
      })
    );
    
    // Scales
    const xScale = d3.scaleTime()
      .domain(timeRange || [transformedData.timespan.start, transformedData.timespan.end])
      .range([0, chartWidth]);
    
    const yScale = d3.scaleLinear()
      .domain([0, d3.max(filteredData, d => d.value) || 0])
      .range([chartHeight, 0])
      .nice();
    
    // Line generator
    const line = d3.line<FlattenedDataPoint>()
      .x(d => xScale(d.date))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);
    
    // Add axes
    const xAxis = chart
      .append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0, ${chartHeight})`)
      .call(d3.axisBottom(xScale)
        .tickFormat(d => {
          const date = d as Date;
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        })
        .ticks(Math.min(10, filteredData.length / 24)) // Show at most 10 ticks, or one per 2 years
      );
      
    // Rotate x-axis labels for better readability
    xAxis.selectAll('text')
      .attr('transform', 'rotate(-45)')
      .attr('text-anchor', 'end')
      .attr('dx', '-.8em')
      .attr('dy', '.15em');
    
    chart
      .append('g')
      .attr('class', 'y-axis')
      .call(d3.axisLeft(yScale));
    
    // Add axis labels
    chart
      .append('text')
      .attr('class', 'x-label')
      .attr('text-anchor', 'middle')
      .attr('x', chartWidth / 2)
      .attr('y', chartHeight + margin.bottom - 5)
      .text('Date');
    
    chart
      .append('text')
      .attr('class', 'y-label')
      .attr('text-anchor', 'middle')
      .attr('transform', 'rotate(-90)')
      .attr('x', -chartHeight / 2)
      .attr('y', -margin.left + 20)
      .text('Consumer Price Index');
    
    // Add chart title
    svg
      .append('text')
      .attr('class', 'chart-title')
      .attr('text-anchor', 'middle')
      .attr('x', width / 2)
      .attr('y', 20)
      .attr('font-size', '16px')
      .attr('font-weight', 'bold')
      .text(transformedData.metadata.title);
    
    // Add lines for each category
    const lines = chart
      .selectAll('.line')
      .data(dataByCategory)
      .enter()
      .append('path')
      .attr('class', 'line')
      .attr('d', d => line(d.values))
      .attr('fill', 'none')
      .attr('stroke', d => colorScale(d.categoryCode))
      .attr('stroke-width', 2)
      .attr('opacity', 0.8);
    
    // Add data points for interaction
    const dots = chart
      .selectAll('.dot-group')
      .data(dataByCategory)
      .enter()
      .append('g')
      .attr('class', 'dot-group');
    
    dots
      .selectAll('.dot')
      .data(d => d.values)
      .enter()
      .append('circle')
      .attr('class', 'dot')
      .attr('cx', d => xScale(d.date))
      .attr('cy', d => yScale(d.value))
      .attr('r', 3)
      .attr('fill', d => colorScale(d.categoryCode))
      .attr('opacity', 0) // Initially invisible
      .on('mouseover', (event, d) => {
        setHoveredPoint(d);
        d3.select(event.target)
          .attr('r', 5)
          .attr('opacity', 1);
      })
      .on('mouseout', (event) => {
        setHoveredPoint(null);
        d3.select(event.target)
          .attr('r', 3)
          .attr('opacity', 0);
      });
    
    // Add legend
    const legendGroup = svg
      .append('g')
      .attr('class', 'legend')
      .attr('transform', `translate(${width - margin.right + 20}, ${margin.top})`);
    
    const legend = legendGroup
      .selectAll('.legend-item')
      .data(dataByCategory)
      .enter()
      .append('g')
      .attr('class', 'legend-item')
      .attr('transform', (d, i) => `translate(0, ${i * 25})`)
      .style('cursor', 'pointer')
      .on('click', (event, d) => {
        // Toggle category visibility
        const newActiveCategories = new Set(activeCategories);
        if (newActiveCategories.has(d.categoryCode)) {
          newActiveCategories.delete(d.categoryCode);
        } else {
          newActiveCategories.add(d.categoryCode);
        }
        setActiveCategories(newActiveCategories);
      });
    
    legend
      .append('rect')
      .attr('width', 15)
      .attr('height', 15)
      .attr('fill', d => colorScale(d.categoryCode))
      .attr('opacity', d => activeCategories.has(d.categoryCode) ? 1 : 0.3);
    
    legend
      .append('text')
      .attr('x', 20)
      .attr('y', 12)
      .text(d => d.categoryName)
      .attr('opacity', d => activeCategories.has(d.categoryCode) ? 1 : 0.3);
    
    // Add tooltip
    const tooltip = d3.select('body')
      .append('div')
      .attr('class', 'tooltip')
      .style('position', 'absolute')
      .style('background', 'white')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('padding', '10px')
      .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)')
      .style('opacity', 0)
      .style('pointer-events', 'none');
    
    // Add hover area for the chart
    chart
      .append('rect')
      .attr('class', 'hover-area')
      .attr('width', chartWidth)
      .attr('height', chartHeight)
      .attr('fill', 'none')
      .attr('pointer-events', 'all')
      .on('mousemove', (event) => {
        const [mouseX] = d3.pointer(event);
        const xDate = xScale.invert(mouseX);
        
        // Find the closest data point for each category
        const closestPoints = dataByCategory.map(category => {
          const points = category.values;
          if (points.length === 0) return null;
          
          // Find closest point by date
          let closestPoint = points[0];
          let closestDistance = Math.abs(closestPoint.date.getTime() - xDate.getTime());
          
          for (let i = 1; i < points.length; i++) {
            const point = points[i];
            const distance = Math.abs(point.date.getTime() - xDate.getTime());
            if (distance < closestDistance) {
              closestPoint = point;
              closestDistance = distance;
            }
          }
          
          return closestPoint;
        }).filter(Boolean) as FlattenedDataPoint[];
        
        if (closestPoints.length === 0) return;
        
        // Show tooltip with all category values for the closest date
        const tooltipContent = `
          <div style="font-weight: bold;">${closestPoints[0].timeLabel}</div>
          <table style="margin-top: 5px;">
            ${closestPoints.map(point => `
              <tr>
                <td style="padding-right: 10px; color: ${colorScale(point.categoryCode)};">
                  ${point.categoryName}:
                </td>
                <td style="text-align: right; font-weight: bold;">
                  ${point.value.toFixed(2)}
                </td>
              </tr>
            `).join('')}
          </table>
        `;
        
        tooltip
          .html(tooltipContent)
          .style('left', `${event.pageX + 15}px`)
          .style('top', `${event.pageY - 28}px`)
          .style('opacity', 1);
        
        // Highlight the dots
        chart.selectAll('.dot')
          .attr('opacity', 0);
        
        closestPoints.forEach(point => {
          chart.selectAll('.dot')
            .filter(d => (d as FlattenedDataPoint).timeLabel === point.timeLabel)
            .attr('opacity', 1)
            .attr('r', 5);
        });
      })
      .on('mouseout', () => {
        tooltip.style('opacity', 0);
        chart.selectAll('.dot')
          .attr('opacity', 0)
          .attr('r', 3);
      });
    
    // Return a cleanup function
    return () => {
      tooltip.remove();
    };
  }, [transformedData, activeCategories, timeRange, width, height, margin, colorScale]);
  
  // Time range slider component (simplified for this example)
  const renderTimeRangeSlider = () => {
    if (!transformedData) return null;
    
    // In a real implementation, you would use a proper range slider component
    return (
      <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center' }}>
        <div>Time Range Slider (Not Implemented in this Example)</div>
      </div>
    );
  };
  
  if (!transformedData) return <div>Loading...</div>;
  
  return (
    <div>
      <svg ref={svgRef} width={width} height={height} />
      {renderTimeRangeSlider()}
      {hoveredPoint && (
        <div style={{ marginTop: 10, textAlign: 'center' }}>
          Selected: {hoveredPoint.categoryName} - {hoveredPoint.timeLabel}: {hoveredPoint.value.toFixed(2)}
        </div>
      )}
    </div>
  );
};

export default CPIChart;