import { fetchScbData } from "@/api/scbApi";
import { useEffect, useState } from "react";
import Chart from "./Chart";
import { KPIApiResponse } from "./types";

const body = {
  query: [
    {
      code: "VaruTjanstegrupp",
      selection: {
        filter: "vs:VaruTjänstegrCoicopA",
        values: [
          "01", "02", "03", "04", "05", "06",
          "07", "08", "09", "11", "12" // No data for 10 - utbildning
        ]
      }
    },
    {
      code: "ContentsCode",
      selection: {
        filter: "item",
        values: ["000003TJ"]
      }
    }
  ],
  response: {
    format: "json-stat2"
  }
};

export default function KPI() {
  const [data, setData] = useState<KPIApiResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const responseData = await fetchScbData("START/PR/PR0101/PR0101A/KPICOI80MN", body);
        setData(responseData);
        setError(null);
      } catch (err) {
        console.error("Error fetching KPI data:", err);
        setError('Failed to load data. Please try again later.');
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <div className="dashboard-container">
      <h1>Swedish Consumer Price Index (KPI)</h1>
      <p className="description">
        This visualization shows the Consumer Price Index (KPI) for different categories of goods and services over time.
        The KPI measures the average price development for the entire private domestic consumption.
      </p>
      
      {loading && <p>Loading data...</p>}
      {error && <p className="error-message">{error}</p>}
      
      <div className="chart-container">
        {data && (
          <Chart 
            apiData={data} 
            width={1000} 
            height={600} 
          />
        )}
      </div>
      
      <div className="insights">
        <h2>Key Insights</h2>
        <ul>
          <li>Click on category names in the legend to show/hide individual categories</li>
          <li>Hover over the chart to see detailed values for each category at specific points in time</li>
          <li>Compare inflation rates across different categories of goods and services</li>
        </ul>
      </div>
      
      <div className="data-source">
        <p>Source: Statistics Sweden (SCB)</p>
        <p>Last updated: {data ? new Date(data.updated).toLocaleDateString() : 'Unknown'}</p>
      </div>
    </div>
  );
}
