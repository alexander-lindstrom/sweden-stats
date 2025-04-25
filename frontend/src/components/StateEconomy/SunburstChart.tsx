import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import ResponsiveChartWrapper from '../charts/ResponsiveChartWrapper';

export type SunburstNode = {
  name: string;
  value?: number;
  children?: SunburstNode[];
};

type Props = {
  data: SunburstNode;
  unit: string;
  maxChildren: number;
  width?: number;
  height?: number;
};

type HierarchyNodeWithCurrent = d3.HierarchyRectangularNode<SunburstNode> & {
    current?: d3.HierarchyRectangularNode<SunburstNode>;
    target?: { x0: number; x1: number; y0: number; y1: number };
    isNegativeOnly?: boolean;
    signedValue?: number;
};

function truncateLabel(name: string, limit = 12): string {
  if (name.length < limit) return name;

  const words = name.split(" ");
  if (words.length === 1) {
    return name.substring(0, limit - 3) + "...";
  }

  let result = "";
  let currentLength = 0;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const space = i > 0 ? 1 : 0;
    
    if (currentLength === 0 && word.length + space > limit) {
      // Special case: first word is too long, truncate it
      return word.substring(0, limit - 3) + "...";
    }
    
    if (currentLength + word.length + space <= limit) {
      result += (space ? " " : "") + word;
      currentLength += word.length + space;
    } else {
      break;
    }
  }

  // Remove trailing comma, if any
  result = result.replace(/,\s*$/, "");

  return result;
}

const SunburstChart: React.FC<Props> = ({
    data,
    unit,
    maxChildren,
}) => {
  return (
    <ResponsiveChartWrapper aspectRatio={1} minHeight={400}>
      {({ width, height }) => (
        <SunburstChartInner
          data={data}
          unit={unit}
          maxChildren={maxChildren}
          width={width}
          height={height}
        />
      )}
    </ResponsiveChartWrapper>
  );
};

const SunburstChartInner: React.FC<Props> = ({
  data,
  unit,
  maxChildren = 2,
  width = 600,
  height = 600
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
      if (!data) return;

      const radius = width / (maxChildren * 3);
      const grayColor = "#888888";

      const svg = d3.select(svgRef.current);
      svg.selectAll("*").remove();

      const color = d3.scaleOrdinal(d3.quantize(d3.interpolateRainbow, (data.children || []).length + 1));

      const hierarchy = d3.hierarchy(data)
          .sum(d => Math.abs(d.value ?? 0))
          .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

      hierarchy.eachAfter(node => {
          const extendedNode = node as HierarchyNodeWithCurrent;
          if (extendedNode.children && extendedNode.children.length > 0) {
              // Parent node: Check children
              let allChildrenNegativeOrZero = true;
              let hasContributingChildren = false;

              for (const child of extendedNode.children as HierarchyNodeWithCurrent[]) {
                  if (child.value && child.value > 1e-6) {
                       hasContributingChildren = true;
                       if (!child.isNegativeOnly) {
                           allChildrenNegativeOrZero = false;
                           break;
                       }
                  }
              }
              extendedNode.isNegativeOnly = hasContributingChildren && allChildrenNegativeOrZero;
          } else {
              extendedNode.isNegativeOnly = (extendedNode.data.value !== undefined && extendedNode.data.value < 0);
          }
      });

      const root = d3.partition<SunburstNode>()
          .size([2 * Math.PI, hierarchy.height + 1])(hierarchy) as HierarchyNodeWithCurrent;

      root.each(d => {
          (d as HierarchyNodeWithCurrent).current = d;
      });

      const totalValue = root.value as number;

      const arc = d3.arc<HierarchyNodeWithCurrent>()
          .startAngle(d => d.x0)
          .endAngle(d => d.x1)
          .padAngle(d => Math.min((d.x1 - d.x0) / 2, 0.005))
          .padRadius(radius * 1.5)
          .innerRadius(d => d.y0 * radius)
          .outerRadius(d => Math.max(d.y0 * radius, d.y1 * radius - 1));

      const g = svg.append("g")
          .attr("transform", `translate(${width / 2},${height / 2})`);

      const tooltip = d3.select(tooltipRef.current)
          .style("opacity", 0)
          .style("position", "absolute")
          .style("background-color", "rgba(0, 0, 0, 0.7)")
          .style("color", "white")
          .style("padding", "5px 10px")
          .style("border-radius", "3px")
          .style("pointer-events", "none")
          .style("font-size", "12px");

      const format = d3.format(",d");

      const mouseover = (event: MouseEvent, d: HierarchyNodeWithCurrent) => {
          tooltip.transition().duration(200).style("opacity", 0.9);
          const pathString = d.ancestors().slice(0, -1).reverse().map(anc => anc.data.name).join(" / ");
          const originalValue = d.data.value;
          const displayValue = originalValue !== undefined
              ? `${format(originalValue)} ${unit}`
              : `${format(d.value ?? 0)} ${unit}`;
          const percentageString = (d.value && totalValue)
              ? ` (${((d.value / totalValue) * 100).toFixed(1)}% av total)`
              : '';
          tooltip.html(`${pathString}<br>${displayValue}${percentageString}`)
                 .style("left", (event.pageX + 15) + "px")
                 .style("top", (event.pageY - 10) + "px");
      };

      const mousemove = (event: MouseEvent) => {
          tooltip.style("left", (event.pageX + 15) + "px")
                 .style("top", (event.pageY - 10) + "px");
      };

      const mouseleave = () => {
          tooltip.transition().duration(500).style("opacity", 0);
      };

      const path = g.append("g")
          .selectAll("path")
          .data(root.descendants().slice(1))
          .join("path")
          .attr("fill", d => {
              const node = d as HierarchyNodeWithCurrent;
              if (node.isNegativeOnly) {
                  return grayColor;
              }
              let ancestor = node;
              while (ancestor.depth > 1 && ancestor.parent) {
                  ancestor = ancestor.parent as HierarchyNodeWithCurrent;
              }
              return color(ancestor.data.name);
          })
          .attr("fill-opacity", d => arcVisible(d.current!) ? (d.children ? 0.7 : 0.5) : 0)
          .attr("pointer-events", d => arcVisible(d.current!) ? "auto" : "none")
          .attr("d", d => arc(d.current!))
          .on("mouseover", mouseover)
          .on("mousemove", mousemove)
          .on("mouseleave", mouseleave);

      path.filter(d => !!d.children)
          .style("cursor", "pointer")
          .on("click", (event, p) => clicked(event, p as HierarchyNodeWithCurrent));

      const label = g.append("g")
          .attr("pointer-events", "none")
          .attr("text-anchor", "middle")
          .style("user-select", "none")
          .selectAll("text")
          .data(root.descendants().slice(1))
          .join("text")
          .attr("dy", "0.35em")
          .attr("fill", "#333")
          .style("font-size", "10px")
          .attr("fill-opacity", d => +labelVisible(d.current!))
          .attr("transform", d => labelTransform(d.current!))
          .text(d => truncateLabel(d.data.name));

      const parent = g.append("circle")
          .datum(root)
          .attr("r", radius)
          .attr("fill", "none")
          .attr("pointer-events", "all")
          .style("cursor", "pointer")
          .on("click", (event, p) => clicked(event, p as HierarchyNodeWithCurrent));

       g.append("text")
           .datum(root)
           .attr("text-anchor", "middle")
           .attr("dy", "0.35em")
           .attr("fill", "#666")
           .style("font-size", "11px")
           .attr("pointer-events", "none");


      function arcVisible(d: { x0: number; x1: number; }): boolean {
          return d.x1 - d.x0 > 1e-6;
      }

      function labelVisible(d: { y0: number; y1: number; x0: number; x1: number; }): boolean {
           const angleWidth = d.x1 - d.x0;
           const innerRadius = d.y0 * radius;
           const outerRadius = Math.max(d.y0 * radius, d.y1 * radius - 1);
           return (angleWidth > 0.02 && (outerRadius - innerRadius) > 10);
      }

      function labelTransform(d: { x0: number; x1: number; y0: number; y1: number; }): string {
          const x = (d.x0 + d.x1) / 2 * 180 / Math.PI;
          const y = (d.y0 * radius + Math.max(d.y0 * radius, d.y1 * radius - 1)) / 2;
          const rotation = x - 90;
          const flip = rotation > 90 && rotation < 270;
          return `rotate(${rotation}) translate(${y},0) rotate(${flip ? 180 : 0})`;
      }

      function clicked(_event: MouseEvent, p: HierarchyNodeWithCurrent) {
          parent.datum(p.parent || root);

          root.each((d) => {
              const node = d as HierarchyNodeWithCurrent;
              node.target = {
                  x0: Math.max(0, Math.min(1, (d.x0 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
                  x1: Math.max(0, Math.min(1, (d.x1 - p.x0) / (p.x1 - p.x0))) * 2 * Math.PI,
                  y0: Math.max(0, d.y0 - p.depth),
                  y1: Math.max(0, d.y1 - p.depth)
              };
          });

          const t = svg.transition().duration(750);

          path.transition(t)
              .tween("data", d => {
                  const i = d3.interpolate((d as HierarchyNodeWithCurrent).current!, (d as HierarchyNodeWithCurrent).target!);
                  return tVal => { (d as HierarchyNodeWithCurrent).current = i(tVal); };
              })
              .filter(function (d) {
                  const node = d as HierarchyNodeWithCurrent;
                  return +this.getAttribute("fill-opacity") > 1e-6 || arcVisible(node.target!);
              })
              .attr("fill-opacity", d => {
                  const node = d as HierarchyNodeWithCurrent;
                  return arcVisible(node.target!) ? (node.children ? 0.7 : 0.5) : 0;
              })
              .attr("pointer-events", d => arcVisible((d as HierarchyNodeWithCurrent).target!) ? "auto" : "none")
              .attrTween("d", d => () => arc((d as HierarchyNodeWithCurrent).current!));

          label.filter(function (d) {
              const node = d as HierarchyNodeWithCurrent;
              return +this.getAttribute("fill-opacity") > 1e-6 || labelVisible(node.target!);
          })
          .transition(t)
          .attr("fill-opacity", d => +labelVisible((d as HierarchyNodeWithCurrent).target!))
          .attrTween("transform", d => () => labelTransform((d as HierarchyNodeWithCurrent).current!));
      }

  }, [width, height, data, unit, maxChildren]);

  return (
    <div style={{ fontFamily: 'sans-serif', width: '100%', maxWidth: `${width}px`, margin: 'auto' }}>
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