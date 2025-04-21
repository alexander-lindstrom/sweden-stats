import { useEffect, useState } from "react";
import { fetchAllExpenses } from "@/api/StateExpensesApi";
import SunburstChart, { SunburstNode } from "./SunburstChart";

export default function StateExpenses() {
  const [expensesData, setExpensesData] = useState<Record<string, SunburstNode> | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllExpenses()
      .then(setExpensesData)
      .catch(() => setError("Failed to load expenses data"));
  }, []);

  if (error) return <div className="text-red-500">{error}</div>;
  if (!expensesData) return <div>Loading...</div>;

  return (
    <div className="p-4">
      <SunburstChart 
        dataByYear={expensesData} 
        title="Statens Utgifter"
        unit="miljoner SEK"
      />
    </div>
  );
}
