import { useGetPopulationStatisticsQuery } from "@/api/scbApi";
import { PopulationQueryArgs } from "@/util/scb";
import { useState } from "react";

export const PopulationDataViewer: React.FC = () => {
  const [queryArgs, setQueryArgs] = useState<PopulationQueryArgs | undefined>(undefined);
  const [currentSelectionLabel, setCurrentSelectionLabel] = useState<string>("No selection");

  const { data, error, isLoading, isFetching } = useGetPopulationStatisticsQuery(
    queryArgs || {},
    { skip: queryArgs === undefined }
  );

  const handleFetch = (args: PopulationQueryArgs, label: string) => {
    setQueryArgs(args);
    setCurrentSelectionLabel(label);
  };

  // Basic styling (inline or via CSS classes if preferred)
  const styles = {
    container: { padding: '20px', fontFamily: 'Arial, sans-serif', maxWidth: '800px', margin: 'auto' },
    heading: { fontSize: '24px', marginBottom: '20px' },
    button: { padding: '10px 15px', marginRight: '10px', marginBottom: '10px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: '4px' },
    activeButton: { backgroundColor: '#4CAF50', color: 'white' },
    pre: { backgroundColor: '#f4f4f4', padding: '15px', borderRadius: '4px', overflowX: 'auto', maxHeight: '400px' },
    error: { color: 'red', backgroundColor: '#ffdddd', padding: '10px', borderRadius: '4px' },
    loading: { fontSize: '18px', color: '#555' },
    controlsContainer: { margin: '20px 0', padding: '15px', border: '1px solid #eee', borderRadius: '4px'},
    selectionInfo: { fontSize: '16px', fontWeight: 'bold', marginBottom: '10px' }
  };


  const isCurrentSelection = (label: string) => currentSelectionLabel === label;

  return (
    <div style={styles.container}>
      <h1 style={styles.heading}>SCB Population Statistics (TAB5444)</h1>

      <div style={styles.controlsContainer}>
        <h2 style={{fontSize: '18px', marginBottom: '15px'}}>Select Data to Fetch:</h2>
        <button
          onClick={() => handleFetch({}, "All Regions, All Ages")}
          style={{...styles.button, ...(isCurrentSelection("All Regions, All Ages") ? styles.activeButton : {})}}
          disabled={isLoading || isFetching}
        >
          Fetch All Regions & Ages
        </button>
        <button
          onClick={() => handleFetch({ regionCodes: ['01'] }, "Stockholm County (01), All Ages")}
          style={{...styles.button, ...(isCurrentSelection("Stockholm County (01), All Ages") ? styles.activeButton : {})}}
          disabled={isLoading || isFetching}
        >
          Stockholm (01) - All Ages
        </button>
        <button
          onClick={() => handleFetch({ regionCodes: ['14'], ages: ['0', '1', '2', '3', '4', '5'] }, "Västra Götaland (14), Ages 0-5")}
          style={{...styles.button, ...(isCurrentSelection("Västra Götaland (14), Ages 0-5") ? styles.activeButton : {})}}
          disabled={isLoading || isFetching}
        >
          V. Götaland (14) - Ages 0-5
        </button>
        <button
          onClick={() => handleFetch({ regionCodes: ['01', '03', '04'], ages: ['65+'] }, "Counties 01,03,04 - Ages 65+")}
          style={{...styles.button, ...(isCurrentSelection("Counties 01,03,04 - Ages 65+") ? styles.activeButton : {})}}
          disabled={isLoading || isFetching}
        >
          Counties 01,03,04 - Ages 65+
        </button>
         <button
          onClick={() => handleFetch({ regionCodes: ['10'], sexes: ['2'], ages: ['20', '21','22','23','24','25'] }, "Södermanland (10) - Women, Ages 20-25")}
          style={{...styles.button, ...(isCurrentSelection("Södermanland (10) - Women, Ages 20-25") ? styles.activeButton : {})}}
          disabled={isLoading || isFetching}
        >
          Södermanland (10) - Women, Ages 20-25
        </button>
      </div>

      {queryArgs && <p style={styles.selectionInfo}>Current selection: {currentSelectionLabel}</p>}

      {(isLoading || isFetching) && (
        <p style={styles.loading}>
          {isLoading && !isFetching ? 'Loading initial data...' : 'Fetching data...'}
        </p>
      )}

      {error && (
        <div style={styles.error}>
          <p>Error fetching data:</p>
          <pre>
            {('status' in error ? `Status: ${(error as Record<string, unknown>).status}\n` : '') +
             ('data' in error ? JSON.stringify((error as Record<string, unknown>).data, null, 2) : JSON.stringify(error, null, 2))}
          </pre>
        </div>
      )}

      {data && !isFetching && queryArgs && (
        <div>
          <h2 style={{fontSize: '20px', marginTop: '20px', marginBottom: '10px'}}>Data Received (JSON-stat 2.0 Format):</h2>
    
            {JSON.stringify(data, null, 2)}
    
        </div>
      )}

      {!queryArgs && !isLoading && !error && (
         <p style={{color: '#777'}}>Please select a data set to fetch.</p>
      )}
    </div>
  );
};