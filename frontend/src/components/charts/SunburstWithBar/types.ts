import * as d3 from 'd3';

export interface DataNode {
  name: string;
  value?: number;
  children?: DataNode[];
}

export type HierarchyDataNode = d3.HierarchyNode<DataNode>;