import { useGetLatestMonthlyPopulationQuery } from "@/api/ScbApi";

export const PopulationDataViewer: React.FC = () => {
    // Using the generated hook to fetch data
    // No arguments are passed to useGetLatestMonthlyPopulationQuery as it's defined as `void`
    const { data, error, isLoading, isFetching, refetch } = useGetLatestMonthlyPopulationQuery();
  
    // Tailwind CSS classes for basic styling
    const containerStyle = "p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4 font-['Inter',_sans-serif]";
    const headingStyle = "text-2xl font-bold text-gray-800";
    const buttonStyle = "px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:opacity-50";
    const preStyle = "p-4 bg-gray-100 rounded-md text-sm overflow-x-auto max-h-96"; // Added max-h-96 for scrollability
    const errorStyle = "p-4 bg-red-100 text-red-700 rounded-md";
    const loadingStyle = "text-lg text-gray-600";
  
    return (
      <div className={containerStyle}>
        <h1 className={headingStyle}>SCB Latest Monthly Population Data</h1>
  
        <button
          onClick={() => refetch()}
          disabled={isLoading || isFetching}
          className={buttonStyle}
        >
          {isFetching ? 'Refreshing...' : 'Refresh Data'}
        </button>
  
        {isLoading && <p className={loadingStyle}>Loading initial data...</p>}
        {!isLoading && isFetching && <p className={loadingStyle}>Fetching updated data...</p>}
  
        {error && (
          <div className={errorStyle}>
            <p>Error fetching data:</p>
            {/* Attempt to stringify the error. Some errors might not be objects. */}
            <pre className="whitespace-pre-wrap">
              {('status' in error ? `Status: ${error.status}\n` : '') +
               ('data' in error ? JSON.stringify(error.data, null, 2) : JSON.stringify(error, null, 2))}
            </pre>
          </div>
        )}
  
        {data && (
          <div>
            <h2 className="text-xl font-semibold text-gray-700 mt-4 mb-2">Data Received (JSON-stat 2.0 Format):</h2>
            <pre className={preStyle}>
              {JSON.stringify(data, null, 2)}
            </pre>
            {/* You would typically parse this JSON-stat data and display it in a more user-friendly way (e.g., a table) */}
          </div>
        )}
  
        {!isLoading && !error && !data && (
          <p className="text-gray-500">No data available or query has not run yet.</p>
        )}
      </div>
    );
  };