import { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';
import { TransformedKPIData } from './KpiTypes';
import ResponsiveChartWrapper from '../charts/ResponsiveChartWrapper';

export default function KpiLineChart({ data }: { data: TransformedKPIData }) {
  return (
    <ResponsiveChartWrapper aspectRatio={0.4} minHeight={250}>
      {({ width, height }) => (
        <KpiLineChartInner data={data} width={width} height={height} />
      )}
    </ResponsiveChartWrapper>
  );
}

function KpiLineChartInner({ 
  data, 
  width, 
  height 
}: { 
  data: TransformedKPIData;
  width: number;
  height: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [selectedCategories, setSelectedCategories] = useState<Record<string, boolean>>({});
  const [isInitialized, setIsInitialized] = useState(false);

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
    if (!svgRef.current || !tooltipRef.current || !isInitialized) {
      return;
    }

    const filteredData = getFilteredData();
    if (filteredData.length === 0) {
      return;
    }

    // Clear existing chart
    d3.select(svgRef.current).selectAll('*').remove();

    const margin = { top: 40, right: 40, bottom: 60, left: 60 };
    const adjustedWidth = width - margin.left - margin.right;
    const adjustedHeight = height - margin.top - margin.bottom;

    const svg = d3.select(svgRef.current)
      .attr('width', adjustedWidth + margin.left + margin.right)
      .attr('height', adjustedHeight + margin.top + margin.bottom)
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
      .range([0, adjustedWidth]);

    const yScale = d3.scaleLinear()
      .domain([0, d3.max(allTimePoints, d => d.value) as number])
      .range([adjustedHeight, 0])
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
      .attr('transform', `translate(0,${adjustedHeight})`)
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
      .attr('x', adjustedWidth / 2)
      .attr('y', adjustedHeight + margin.bottom - 5)
      .style('text-anchor', 'middle')
      .text('Datum');

    // Add Y axis label
    svg.append('text')
      .attr('class', 'y-axis-label')
      .attr('transform', 'rotate(-90)')
      .attr('x', -adjustedHeight / 2)
      .attr('y', -margin.left + 15)
      .style('text-anchor', 'middle')
      .text('Index');

    // Create line generator with proper typing
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
        .attr('stroke-width', 3)
        .attr('d', line(timePointsWithDates));
    });

    // Create tooltip overlay
    const tooltip = d3.select(tooltipRef.current)
      .style('opacity', 0)
      .style('position', 'absolute')
      .style('background-color', 'white')
      .style('border', '1px solid #ddd')
      .style('border-radius', '4px')
      .style('padding', '10px')
      .style('pointer-events', 'none')
      .style('box-shadow', '0 2px 5px rgba(0,0,0,0.1)');

    // Create a vertical line for hover
    const verticalLine = svg.append('line')
      .attr('class', 'hover-line')
      .attr('y1', 0)
      .attr('y2', adjustedHeight)
      .style('stroke', '#999')
      .style('stroke-dasharray', '4,4')
      .style('opacity', 0);

    // Create overlay for mouse tracking
    const overlay = svg.append('rect')
      .attr('width', adjustedWidth)
      .attr('height', adjustedHeight)
      .style('fill', 'none')
      .style('pointer-events', 'all');

    // Function to find closest time point for a given x position
    const bisectDate = d3.bisector((d: { parsedDate: Date }) => d.parsedDate).left;

    // Tooltip interaction
    overlay.on('mousemove', function(event) {
      const mouseX = d3.pointer(event)[0];
      
      if (mouseX < 0 || mouseX > adjustedWidth) {
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

      // Show tooltip - positioned directly to the east of cursor
      const formatValue = d3.format(",.2f");
      const tooltipHTML = `
        <div>
          <strong>Datum: ${tooltipData[0]?.date || ''}</strong>
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

      const [pointerX, pointerY] = d3.pointer(event, svg.node());

      tooltip
        .html(tooltipHTML)
        .style('left', `${pointerX + 100}px`)
        .style('top', `${pointerY - 50}px`)
        .style('opacity', 1);
    });

    overlay.on('mouseout', function() {
      tooltip.style('opacity', 0);
      verticalLine.style('opacity', 0);
    });

  }, [data, selectedCategories, isInitialized, width, height]);

  const colorScale = getColorScale();

  return (
    <div className="kpi-chart-container">
      <div className="chart-title text-lg font-bold mb-2">{data.metadata.title}</div>
      
      <div className="legend-container mb-2 flex flex-wrap gap-2">
        {data.byCategory.map(category => (
          <button
            key={category.categoryCode}
            onClick={() => toggleCategory(category.categoryCode)}
            className={`
              px-2 py-1 rounded-md text-sm flex items-center transition-all
              ${selectedCategories[category.categoryCode] 
                ? 'bg-gray-100 shadow-sm' 
                : 'bg-gray-50 opacity-50'}
            `}
          >
            <span 
              className="inline-block w-3 h-3 rounded-full mr-2"
              style={{ backgroundColor: colorScale(category.categoryCode) as string }}
            ></span>
            <span className="truncate">{category.categoryName}</span>
          </button>
        ))}
      </div>
      
      <div className="chart-container relative">
        <svg ref={svgRef}></svg>
        <div ref={tooltipRef} className="tooltip"></div>
      </div>
      
      <div className="chart-footer text-sm text-gray-600 mt-4">
        <div>Källa: {data.metadata.source}</div>
        <div>
          Uppdaterad: {new Intl.DateTimeFormat('sv-SE').format(new Date(data.metadata.updated))}
        </div>
      </div>
    </div>
  );
}