import { useEffect, useState, useMemo } from "react";
import { fetchAllExpenses } from "@/api/StateExpensesApi";
import SunburstChart, { SunburstNode } from "./SunburstChart";
import YearSlider from "./YearSlider";

export default function StateExpenses() {
  const [expensesData, setExpensesData] = useState<Record<string, SunburstNode> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedYear, setSelectedYear] = useState<string>(''); 

  useEffect(() => {
    fetchAllExpenses()
      .then(data => {
        setExpensesData(data);

        const availableYears = data ? Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b)) : [];
        if (availableYears.length > 0) {
          setSelectedYear(availableYears[availableYears.length - 1]); 
        }
      })
      .catch((err) => {
        console.error("Failed to load expenses data:", err);
        setError("Failed to load expenses data");
      });
  }, []);

  const years: string[] = useMemo(() => {
    return expensesData ? Object.keys(expensesData).sort((a, b) => parseInt(a) - parseInt(b)) : [];
  }, [expensesData]);

  const currentExpensesData: SunburstNode | undefined = useMemo(() => {
    return expensesData && selectedYear ? expensesData[selectedYear] : undefined;
  }, [expensesData, selectedYear]);

  if (error) {
    return <div className="text-red-500 p-4">{error}</div>;
  }

  if (!expensesData || !selectedYear) { 
    return <div className="p-4">Loading...</div>;
  }

  return (
    <div className="p-4 h-full flex flex-col"> 
      <div className="flex-shrink-0 mb-4">  
        <h2 
          style={{ fontFamily: 'sans-serif' }}
          className="text-xl font-semibold mb-2 text-left"
        >
          Statens Utgifter efter kategori ({selectedYear}) 
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
        {currentExpensesData ? (
          <SunburstChart 
            data={currentExpensesData} 
            unit="mnkr"
            maxChildren={2}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
             Ingen data tillgänglig för {selectedYear}. 
          </div>
        )}
      </div>
      <div>Källa: ESV</div>
        <div>
          Uppdaterad: 2025
        </div>
    </div>
  );
}