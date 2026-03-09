const EXPENSES_API_URL = "/api/expenses/";
const REVENUE_API_URL = "/api/revenue/";

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

export const fetchAllRevenue = async () => {
  try {
    const response = await fetch(REVENUE_API_URL);
    if (!response.ok) {
      throw new Error(`Revenue API error: ${response.statusText}`);
    }
    const data = await response.json();
    return data;
  } catch (err) {
    console.error("Error fetching all revenue:", err);
    throw err;
  }
};
