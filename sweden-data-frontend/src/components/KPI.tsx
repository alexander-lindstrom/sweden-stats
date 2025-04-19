import { useEffect } from "react";

export default function KPI() {
  useEffect(() => {
    const fetchData = async () => {
      const body = {
        query: [
          {
            code: "VaruTjanstegrupp",
            selection: {
              filter: "vs:VaruTjänstegrCoicopA",
              values: [
                "01", "02", "03", "04", "05", "06",
                "07", "08", "09", "10", "11", "12"
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
          format: "px"
        }
      };

      try {
        const res = await fetch("https://api.scb.se/OV0104/v1/doris/sv/ssd/START/PR/PR0101/PR0101A/KPICOI80MN", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        });

        const data = await res.text();
        console.log("KPI Subcategory Data:", data);
      } catch (err) {
        console.error("Error fetching KPI data:", err);
      }
    };

    fetchData();
  }, []);

  return null;
}