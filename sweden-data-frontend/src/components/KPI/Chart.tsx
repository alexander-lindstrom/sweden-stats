import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { TransformedKPIData } from './KpiTypes';

export default function KPILineChart({ data }: { data: TransformedKPIData }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, boolean>>({});
  const [isInitialized, setIsInitialized] = useState(false);

  console.log(data)

  // Initialize selected categories on first render
  useEffect(() => {
    if (!isInitialized && data.byCategory.length > 0) {
      const initialSelected = data.byCategory.reduce((acc, category) => {
        acc[category.categoryCode] = true;
        return acc;
      }, {} as Record<string, boolean>);
      setSelectedCategories(initialSelected);
      setIsInitialized(true);
    }
  }, [data, isInitialized]);

  // Toggle category selection
  const toggleCategory = (categoryCode: string) => {
    setSelectedCategories(prev => ({
      ...prev,
      [categoryCode]: !prev[categoryCode]
    }));
  };

  // Filter data for selected categories
  const getFilteredData = () => {
    return data.byCategory.filter(category => 
      selectedCategories[category.categoryCode]
    );
  };

  // Format date strings to Date objects for D3
  const parseDate = (dateStr: string) => {
    // Format is YYYYMXX
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(5, 7), 10) - 1; // 0-indexed
    return new Date(year, month, 1);
  };

  // Create color scale for categories
  const getColorScale = () => {
    return d3.scaleOrdinal(d3.schemeCategory10)
      .domain(data.byCategory.map(c => c.categoryCode));
  };

  // D3 chart rendering
  useEffect(() => {
    if (!svgRef.current || !tooltipRef.current || !isInitialized) return;

    const filteredData = getFilteredData();
    if (filteredData.length === 0) return;

    // Clear existing chart
    d3.select(svgRef.current).selectAll('*').remove();

    // Setup dimensions
    const margin = { top: 20, right: 80, bottom: 50, left: 60 };
    const width = 800 - margin.left - margin.right;
    const height = 400 - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', width + margin.left + margin.right)
      .attr('height', height + margin.top + margin.bottom)
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Convert date strings to Date objects for all data points
    const allTimePoints = filteredData.flatMap(category => 
      category.timePoints.map(point => ({
        ...point,
        parsedDate: parseDate(point.date)
      }))
    );

    // Create scales
    const xScale = d3.scaleTime()
      .domain(d3.extent(allTimePoints, d => d.parsedDate) as [Date, Date])
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(allTimePoints, d => d.value) as number])
      .range([height, 0])
      .nice();

    const colorScale = getColorScale();

    // Create axes
    const xAxis = d3.axisBottom(xScale)
      .ticks(Math.min(allTimePoints.length / 12, 10))
      .tickFormat(d => d3.timeFormat('%Y-%m')(d as Date));

    const yAxis = d3.axisLeft(yScale);

    // Add X axis
    svg.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${height})`)
      .call(xAxis)
      .selectAll('text')
      .attr('transform', 'rotate(-45)')
      .style('text-anchor', 'end');

    // Add Y axis
    svg.append('g')
      .attr('class', 'y-axis')
      .call(yAxis);

    // Add X axis label
    svg.append('text')
      .attr('class', 'x-axis-label')
      .attr('x', width / 2)
      .attr('y', height + margin.bottom - 5)
      .style('text-anchor', 'middle')
      .text('Time');

    // Add Y axis label
    svg.append('text')
      .attr('class', 'y-axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -height / 2)
      .attr('y', -margin.left + 15)
      .style('text-anchor', 'middle')
      .text('Value');

    // Create line generator
    const line = d3.line<{ parsedDate: Date, value: number }>()
      .x(d => xScale(d.parsedDate))
      .y(d => yScale(d.value))
      .curve(d3.curveMonotoneX);

    // Add lines for each category
    filteredData.forEach(category => {
      const timePointsWithDates = category.timePoints.map(point => ({
        ...point,
        parsedDate: parseDate(point.date)
      }));

      svg.append('path')
        .datum(timePointsWithDates)
        .attr('class', `line-${category.categoryCode}`)
        .attr('fill', 'none')
        .attr('stroke', colorScale(category.categoryCode) as string)
        .attr('stroke-width', 2)
        .attr('d', line as any);
    });

    // Create tooltip overlay
    const tooltip = d3.select(tooltipRef.current)
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background-color', 'white')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('padding', '10px')
      .style('pointer-events', 'none');

    // Create a vertical line for hover
    const verticalLine = svg.append('line')
      .attr('class', 'hover-line')
      .attr('y1', 0)
      .attr('y2', height)
      .style('stroke', '#999')
      .style('stroke-dasharray', '4,4')
      .style('opacity', 0);

    // Create overlay for mouse tracking
    const overlay = svg.append('rect')
      .attr('width', width)
      .attr('height', height)
      .style('fill', 'none')
      .style('pointer-events', 'all');

    // Function to find closest time point for a given x position
    const bisectDate = d3.bisector((d: { parsedDate: Date }) => d.parsedDate).left;

    // Tooltip interaction
    overlay.on('mousemove', function(event) {
      const mouseX = d3.pointer(event)[0];
      
      if (mouseX < 0 || mouseX > width) {
        tooltip.style('opacity', 0);
        verticalLine.style('opacity', 0);
        return;
      }

      const x0 = xScale.invert(mouseX);
      
      // Find values at this x position for all categories
      const tooltipData = filteredData.map(category => {
        const timePointsWithDates = category.timePoints.map(point => ({
          ...point,
          parsedDate: parseDate(point.date)
        }));
        
        const i = bisectDate(timePointsWithDates, x0, 1);
        const d0 = timePointsWithDates[i - 1];
        const d1 = timePointsWithDates[i] || d0;
        const d = x0.getTime() - d0.parsedDate.getTime() > d1.parsedDate.getTime() - x0.getTime() ? d1 : d0;
        
        return {
          category: category.categoryName,
          value: d.value,
          color: colorScale(category.categoryCode) as string,
          date: d3.timeFormat('%Y-%m')(d.parsedDate)
        };
      });

      // Position vertical line
      verticalLine
        .attr('x1', mouseX)
        .attr('x2', mouseX)
        .style('opacity', 1);

      // Show tooltip
      const formatValue = d3.format(",.2f");
      const tooltipHTML = `
        <div>
          <strong>Date: ${tooltipData[0]?.date || ''}</strong>
          <ul style="padding-left: 20px; margin: 5px 0;">
            ${tooltipData.map(d => `
              <li style="list-style: none; margin: 3px 0;">
                <span style="color: ${d.color}; font-weight: bold;">●</span>
                ${d.category}: ${formatValue(d.value)}
              </li>
            `).join('')}
          </ul>
        </div>
      `;

      tooltip
        .html(tooltipHTML)
        .style('left', `${event.pageX + 15}px`)
        .style('top', `${event.pageY - 28}px`)
        .style('opacity', 1);
    });

    overlay.on('mouseout', function() {
      tooltip.style('opacity', 0);
      verticalLine.style('opacity', 0);
    });

    // Add title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', -margin.top / 2)
      .attr('text-anchor', 'middle')
      .style('font-size', '16px')
      .style('font-weight', 'bold')
      .text(data.metadata.title);

  }, [data, selectedCategories, isInitialized]);

  return (
    <div className="kpi-chart-container">
      <div className="chart-title text-lg font-bold mb-4">{data.metadata.title}</div>
      
      <div className="category-selector mb-4">
        <div className="font-medium mb-2">Categories:</div>
        <div className="flex flex-wrap gap-2">
          {data.byCategory.map(category => (
            <button
              key={category.categoryCode}
              className={`px-3 py-1 text-sm rounded-full border ${
                selectedCategories[category.categoryCode] 
                  ? 'bg-blue-500 text-white border-blue-600'
                  : 'bg-gray-100 text-gray-800 border-gray-300'
              }`}
              onClick={() => toggleCategory(category.categoryCode)}
            >
              {category.categoryName}
            </button>
          ))}
        </div>
      </div>
      
      <div className="chart-container relative">
        <svg ref={svgRef} className="w-full"></svg>
        <div ref={tooltipRef} className="tooltip"></div>
      </div>
      
      <div className="chart-footer text-sm text-gray-600 mt-4">
        <div>Source: {data.metadata.source}</div>
        <div>Updated: {data.metadata.updated}</div>
      </div>
    </div>
  );
}