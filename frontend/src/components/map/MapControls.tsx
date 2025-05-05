import { useState } from 'react';
import { BaseMapKey, baseMaps } from './BaseMaps';
import { adminVectorTileLayers } from './VectorTiles';

interface MapControlsProps {
    selectedBase: string;
    setSelectedBase: (base: string) => void;
    baseMapKeys: typeof baseMaps;
    selectedAdminLevel: keyof typeof adminVectorTileLayers;
    setSelectedAdminLevel: (level: keyof typeof adminVectorTileLayers) => void;
  }

  export const MapControls: React.FC<MapControlsProps & { className?: string }> = ({
    selectedBase,
    setSelectedBase,
    baseMapKeys,
    selectedAdminLevel,
    setSelectedAdminLevel,
    className = ''
  }) => {
  const [controlsOpen, setControlsOpen] = useState(false);

  return (
    <div
      className={`map-controls ${className}`}
      style={{
        background: "rgba(255, 255, 255, 0.9)",
        borderRadius: 8,
        boxShadow: "0 2px 10px rgba(0, 0, 0, 0.1)",
        overflow: "hidden",
        width: "100%",
        transition: "all 0.3s ease"
      }}
    >
      <div
        className="controls-header"
        style={{
          padding: "12px 16px",
          borderBottom: "1px solid #eaeaea",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          backgroundColor: "#f8f8f8",
          cursor: "pointer"
        }}
        onClick={() => setControlsOpen(!controlsOpen)}
      >
        <h3 style={{ margin: 0, fontSize: 16 }}>Settings</h3>
        <button
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            fontSize: 18,
            padding: 0
          }}
        >
          {controlsOpen ? "\u2212" : "+"}
        </button>
      </div>

      {controlsOpen && (
        <div style={{ padding: 16 }}>
          <div className="control-section" style={{ marginBottom: 16 }}>
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: "bold",
                fontSize: 14
              }}
            >
              Background map
            </label>
            <select
              value={selectedBase}
              onChange={(e) => setSelectedBase(e.target.value)}
              style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 4,
                border: "1px solid #ddd",
                backgroundColor: "white",
                boxSizing: "border-box"
              }}
            >
              {(Object.keys(baseMapKeys) as BaseMapKey[]).map((key) => (
                <option key={key} value={key}>
                    {key}
                </option>
              ))}
            </select>
          </div>

          <div className="control-section" style={{ marginBottom: 16 }}>
            <label
                style={{
                display: "block",
                marginBottom: 8,
                fontWeight: "bold",
                fontSize: 14
                }}
            >
                Administrative boundaries
            </label>
            <select
                value={selectedAdminLevel}
                onChange={(e) =>
                setSelectedAdminLevel(e.target.value as keyof typeof adminVectorTileLayers)
                }
                style={{
                width: "100%",
                padding: "8px 12px",
                borderRadius: 4,
                border: "1px solid #ddd",
                backgroundColor: "white",
                boxSizing: "border-box"
                }}
            >
                {Object.keys(adminVectorTileLayers).map((level) => (
                <option key={level} value={level}>
                    {level}
                </option>
                ))}
            </select>
          </div>


          <div className="control-section">
            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: "bold",
                fontSize: 14
              }}
            >
              Layers
            </label>
            <div
              className="layer-list"
              style={{
                maxHeight: 200,
                overflowY: "auto",
                border: "1px solid #ddd",
                borderRadius: 4,
                backgroundColor: "white"
              }}
            >
            </div>
          </div>
        </div>
      )}
    </div>
  );
};