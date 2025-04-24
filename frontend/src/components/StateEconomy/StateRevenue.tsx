import { useEffect, useState, useMemo } from "react";
import SunburstChart, { SunburstNode } from "./SunburstChart";
import YearSlider from "./YearSlider";
import { fetchAllRevenue } from "@/api/StateExpensesApi";

export default function StateRevenues() {
  const [revenuesData, setRevenuesData] = useState<Record<string, SunburstNode> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>(''); 

  useEffect(() => {
    fetchAllRevenue()
      .then(data => {
        setRevenuesData(data);

        const availableYears = data ? Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b)) : [];
        if (availableYears.length > 0) {
          setSelectedYear(availableYears[availableYears.length - 1]); 
        }
      })
      .catch((err) => {
        console.error("Failed to load revenues data:", err);
        setError("Failed to load revenues data");
      });
  }, []);

  const years: string[] = useMemo(() => {
    return revenuesData ? Object.keys(revenuesData).sort((a, b) => parseInt(a) - parseInt(b)) : [];
  }, [revenuesData]);

  const currentRevenuesData: SunburstNode | undefined = useMemo(() => {
    return revenuesData && selectedYear ? revenuesData[selectedYear] : undefined;
  }, [revenuesData, selectedYear]);

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  if (!revenuesData || !selectedYear) { 
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="p-4 h-full flex flex-col"> 
      <div className="flex-shrink-0 mb-4">  
        <h2 
          style={{ fontFamily: 'sans-serif' }}
          className="text-xl font-semibold mb-2 text-left"
        >
          Statens Inkomster ({selectedYear})
        </h2> 
        
        <div className="max-w-md"> 
          <YearSlider 
            years={years} 
            selectedYear={selectedYear} 
            onYearChange={setSelectedYear} 
          />
        </div>
      </div>

      <div className="flex-grow min-h-0"> 
        {currentRevenuesData ? (
          <SunburstChart 
            data={currentRevenuesData} 
            unit="mnkr"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Ingen data tillgänglig för {selectedYear}.
          </div>
        )}
      </div>
      <div>Källa: ESV</div>
      <div>Uppdaterad: 2025</div>
    </div>
  );
}
