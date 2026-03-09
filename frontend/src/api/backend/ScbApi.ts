const SCB_API_URL = "/api/scb";

export const fetchScbData = async (endpoint: string, body: object) => {
  try {
    const response = await fetch(`${SCB_API_URL}/${endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`SCB API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data;
  } catch (err) {
    console.error("Error fetching SCB data:", err);
    throw err;
  }
};
