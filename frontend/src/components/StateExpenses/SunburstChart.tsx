import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";

export type SunburstNode = {
  name: string;
  value?: number;
  children?: SunburstNode[];
};

type Props = {
  dataByYear: Record<string, SunburstNode>;
  title: string;
};

export const SunburstChart: React.FC<Props> = ({ dataByYear, title }) => {
  const years = Object.keys(dataByYear).sort();
  const [selectedYear, setSelectedYear] = useState<string>(years[years.length - 1]);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const width = 500;
    const radius = width / 2;

    const root = d3
      .hierarchy(dataByYear[selectedYear])
      .sum((d) => d.value || 0)
      .sort((a, b) => (b.value || 0) - (a.value || 0));

    const partition = d3.partition<SunburstNode>().size([2 * Math.PI, radius]);
    partition(root);

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove(); // clear on redraw

    const g = svg
      .attr("width", width)
      .attr("height", width)
      .append("g")
      .attr("transform", `translate(${width / 2},${width / 2})`);

    // Create the arc generator
    const arc = d3
      .arc<d3.HierarchyRectangularNode<SunburstNode>>()
      .startAngle((d) => d.x0)
      .endAngle((d) => d.x1)
      .innerRadius((d) => d.y0)
      .outerRadius((d) => d.y1);

    const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, root.children?.length || 1));

    g.selectAll("path")
      .data(root.descendants().filter((d) => d.depth > 0))
      .join("path")
      .attr("d", d => arc(d as d3.HierarchyRectangularNode<SunburstNode>))
      .attr("fill", (d) => color((d.children ? d : d.parent)?.data.name || ""))
      .on("mouseover", (event, d) => {
        const tooltip = tooltipRef.current;
        if (tooltip) {
          tooltip.style.display = "block";
          tooltip.style.left = event.pageX + 10 + "px";
          tooltip.style.top = event.pageY + "px";
          tooltip.innerHTML = `<strong>${d.data.name}</strong><br/>${(d.value || 0).toLocaleString("sv-SE")} Mkr`;
        }
      })
      .on("mouseout", () => {
        const tooltip = tooltipRef.current;
        if (tooltip) tooltip.style.display = "none";
      });

  }, [selectedYear, dataByYear]);

  return (
    <div className="flex flex-col items-center">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="mb-4">
        <label className="mr-2 font-medium">Välj år:</label>
        <select
          className="border px-2 py-1 rounded"
          value={selectedYear}
          onChange={(e) => setSelectedYear(e.target.value)}
        >
          {years.map((year) => (
            <option key={year}>{year}</option>
          ))}
        </select>
      </div>
      <div className="relative">
        <svg ref={svgRef} />
        <div
          ref={tooltipRef}
          className="absolute z-10 bg-white border border-gray-300 rounded px-2 py-1 text-sm pointer-events-none"
          style={{ display: "none", position: "absolute", whiteSpace: "nowrap" }}
        />
      </div>
    </div>
  );
};