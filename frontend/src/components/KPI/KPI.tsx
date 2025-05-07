import { useEffect, useState } from "react";

import { fetchScbData } from "@/api/backend/ScbApi";
import { transformKPIData } from "./Util";
import { KPIApiResponse, TransformedKPIData } from "./KpiTypes";
import KpiLineChart from "./KpiLineChart";

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

export default function Kpi() {
  const [data, setData] = useState<KPIApiResponse | null>(null);
  const [transformedData, setTransformedData] = useState<TransformedKPIData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const responseData = await fetchScbData("START/PR/PR0101/PR0101A/KPICOI80MN", body);
        setData(responseData);
        setTransformedData(transformKPIData(responseData));
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
    <div>
      {loading && <p>Loading data...</p>}
      {error && <p className="error-message">{error}</p>}
      <div>
        {data && transformedData && (
          <KpiLineChart
            data={transformedData}
          />
        )}
      </div>
    </div>
  );
}
