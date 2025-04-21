const EXPENSES_API_URL = "http://localhost:3001/api/expenses/";

export const fetchAllExpenses = async () => {
  try {
    const response = await fetch(EXPENSES_API_URL);
    if (!response.ok) {
      throw new Error(`Expenses API error: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (err) {
    console.error("Error fetching all expenses:", err);
    throw err;
  }
};

export const fetchExpensesByYear = async (year: string) => {
  try {
    const response = await fetch(`${EXPENSES_API_URL}/${year}`);
    if (!response.ok) {
      throw new Error(`Expenses API error: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (err) {
    console.error(`Error fetching expenses for year ${year}:`, err);
    throw err;
  }
};
