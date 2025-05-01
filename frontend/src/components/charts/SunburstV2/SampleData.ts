import { DataNode } from "./types";

export const sampleData: DataNode = {
    name: "Root",
    children: [
      {
        name: "Category A",
        children: [
          { name: "A1", value: 100 },
          { name: "A2", value: 50 },
          { name: "A3", value: -30 }, // Negative value
        ],
      },
      {
        name: "Category B",
        value: 120,
      },
      {
        name: "Category C",
        children: [
          { name: "C1", value: 80 },
          {
            name: "C2",
            children: [
              { name: "C2a", value: 40 },
              { name: "C2b", value: 20 },
            ],
          },
        ],
      },
      {
         name: "Category D - Negative",
         value: -50
      }
    ],
  };