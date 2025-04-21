import React, { useState, useEffect, useRef } from 'react';
import * as d3 from 'd3';
import YearSlider from './YearSlider';

export type SunburstNode = {
  name: string;
  value?: number;
  children?: SunburstNode[];
};

type Props = {
  dataByYear: Record<string, SunburstNode>;
  title: string;
  width?: number;
  height?: number;
};

type HierarchyNodeWithCurrent = d3.HierarchyRectangularNode<SunburstNode> & {
    current?: d3.HierarchyRectangularNode<SunburstNode>;
    target?: { x0: number; x1: number; y0: number; y1: number };
};

const SunburstChart: React.FC<Props> = ({
    dataByYear,
    title,
    width = 800,
    height = width
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const years = Object.keys(dataByYear).sort();
  const [selectedYear, setSelectedYear] = useState<string>(years[0] || '');

  useEffect(() => {
    if (!svgRef.current || !dataByYear[selectedYear]) {
        // Clear previous chart if data is missing for the selected year
        if (svgRef.current) {
             d3.select(svgRef.current).selectAll("*").remove();
        }
        return;
    }

    const data = dataByYear[selectedYear];
    const radius = width / 6;

    // Clear previous SVG contents
    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();


    // Create the color scale.
    const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, (data.children || []).length + 1));

    // Compute the layout.
    const hierarchy = d3.hierarchy(data)
        .sum(d => d.value ?? 1) // Use 1 if value is missing, ensures structure
        .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    const root = d3.partition<SunburstNode>()
        .size([2 * Math.PI, hierarchy.height + 1]) (hierarchy) as HierarchyNodeWithCurrent;

    root.each(d => {
        (d as HierarchyNodeWithCurrent).current = d;
    });

    // Create the arc generator.
    const arc = d3.arc<HierarchyNodeWithCurrent>()
        .startAngle(d => d.x0)
        .endAngle(d => d.x1)
        .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
        .padRadius(radius * 1.5)
        .innerRadius(d => d.y0 * radius)
        .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

    // Create the SVG container.
    const g = svg.append("g")
        .attr("transform", `translate(${width / 2},${height / 2})`);

    // --- Tooltip Setup ---
    const tooltip = d3.select(tooltipRef.current)
        .style("opacity", 0)
        .style("position", "absolute")
        .style("background-color", "rgba(0, 0, 0, 0.7)")
        .style("color", "white")
        .style("padding", "5px 10px")
        .style("border-radius", "3px")
        .style("pointer-events", "none") // Important!
        .style("font-size", "12px");

    const format = d3.format(",d");

    const mouseover = (event: MouseEvent, d: HierarchyNodeWithCurrent) => {
        tooltip.transition().duration(200).style("opacity", 0.9);
        const pathString = d.ancestors().map(anc => anc.data.name).reverse().join(" / ");
        const valueString = d.value ? format(d.value) : 'N/A';
        tooltip.html(`${pathString}<br>Value: ${valueString}`)
               .style("left", (event.pageX + 15) + "px") // Offset from cursor
               .style("top", (event.pageY - 10) + "px");
    };

    const mousemove = (event: MouseEvent) => {
        tooltip.style("left", (event.pageX + 15) + "px")
               .style("top", (event.pageY - 10) + "px");
    };

    const mouseleave = () => {
        tooltip.transition().duration(500).style("opacity", 0);
    };

    // --- Append the Arcs ---
    const path = g.append("g")
      .selectAll("path")
      .data(root.descendants().slice(1))
      .join("path")
        .attr("fill", d => { while (d.depth > 1) d = d.parent as HierarchyNodeWithCurrent; return color(d.data.name); })
        .attr("fill-opacity", d => arcVisible(d.current!) ? (d.children ? 0.6 : 0.4) : 0)
        .attr("pointer-events", d => arcVisible(d.current!) ? "auto" : "none")
        .attr("d", d => arc(d.current!))
        // Add tooltip events
        .on("mouseover", mouseover)
        .on("mousemove", mousemove)
        .on("mouseleave", mouseleave);

    // Make arcs with children clickable for zooming.
    path.filter(d => !!d.children)
        .style("cursor", "pointer")
        .on("click", (event, p) => clicked(event, p as HierarchyNodeWithCurrent));

    // --- Add Labels ---
    const label = g.append("g")
        .attr("pointer-events", "none")
        .attr("text-anchor", "middle")
        .style("user-select", "none")
      .selectAll("text")
      .data(root.descendants().slice(1))
      .join("text")
        .attr("dy", "0.35em")
        .attr("fill", "#333") // Make labels more visible
        .attr("fill-opacity", d => +labelVisible(d.current!))
        .attr("transform", d => labelTransform(d.current!))
        .text(d => d.data.name.length > 15 ? d.data.name.substring(0,12)+"..." : d.data.name);

    // --- Add the Center Circle for Zooming Out ---
    const parent = g.append("circle")
        .datum(root)
        .attr("r", radius)
        .attr("fill", "none")
        .attr("pointer-events", "all")
        .style("cursor", "pointer")
        .on("click", (event, p) => clicked(event, p as HierarchyNodeWithCurrent));

    function arcVisible(d: { y0: number; y1: number; x0: number; x1: number; }): boolean {
      return d.y1 <= radius && d.y0 >= 0 && d.x1 > d.x0;
    }

    function labelVisible(d: { y0: number; y1: number; x0: number; x1: number; }): boolean {
      return d.y1 <= 3 && d.y0 >= 1 && (d.y1 - d.y0) * (d.x1 - d.x0) > 0.03;
    }

    function labelTransform(d: { x0: number; x1: number; y0: number; y1: number; }): string {
      const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
      const y = (d.y0 + d.y1) / 2 * radius;
      return `rotate(${x - 90}) translate(${y},0) rotate(${x < 180 ? 0 : 180})`;
    }

    // --- Zoom Function ---
    function clicked(_event: MouseEvent, p: HierarchyNodeWithCurrent) {
      // Set the parent datum for the center circle click target
      parent.datum(p.parent || root); // If clicking center on root, zoom out target is root itself

      // Calculate the target state for each node
      root.each((d) => {
        (d as HierarchyNodeWithCurrent).target = {
          x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
          y0: Math.max(0, d.y0 - p.depth),
          y1: Math.max(0, d.y1 - p.depth)
        };
      });

      const t = svg.transition().duration(750); // Standard transition duration

      // Transition paths
      path.transition(t)
          .tween("data", d => {
            const i = d3.interpolate((d as HierarchyNodeWithCurrent).current!, (d as HierarchyNodeWithCurrent).target!);
            return t => { (d as HierarchyNodeWithCurrent).current = i(t); };
          })
          .filter(function(d) {
             const node = d as HierarchyNodeWithCurrent;
             return +this.getAttribute("fill-opacity") || arcVisible(node.target!);
          })
          .attr("fill-opacity", d => {
              const node = d as HierarchyNodeWithCurrent;
              return arcVisible(node.target!) ? (node.children ? 0.6 : 0.4) : 0;
          })
          .attr("pointer-events", d => arcVisible((d as HierarchyNodeWithCurrent).target!) ? "auto" : "none")
          .attrTween("d", d => () => arc((d as HierarchyNodeWithCurrent).current!));

      label.filter(function(d) {
            const node = d as HierarchyNodeWithCurrent;
            return +this.getAttribute("fill-opacity") || labelVisible(node.target!);
          })
          .transition(t)
          .attr("fill-opacity", d => +labelVisible((d as HierarchyNodeWithCurrent).target!))
          .attrTween("transform", d => () => labelTransform((d as HierarchyNodeWithCurrent).current!));
    }

  }, [dataByYear, selectedYear, width, height]);


  if (years.length === 0) {
    return <div>{title} - No data available.</div>;
  }
   if (!dataByYear[selectedYear]) {
       return (
           <div>
               <h2>{title}</h2>
               <YearSlider years={years} selectedYear={selectedYear} onYearChange={setSelectedYear} />
               <div>No data available for year {selectedYear}.</div>
               <div ref={tooltipRef}></div>
           </div>
       );
   }

  return (
    <div style={{ fontFamily: 'sans-serif', width: '100%', maxWidth: `${width}px`, margin: 'auto' }}>
      <h2>{title}</h2>
      <YearSlider years={years} selectedYear={selectedYear} onYearChange={setSelectedYear} />
      <svg 
        ref={svgRef} 
        viewBox={`0 0 ${width} ${height}`}
        width={width} 
        height={height}
      >
      </svg>
      <div ref={tooltipRef}></div>
    </div>
  );
};

export default SunburstChart;