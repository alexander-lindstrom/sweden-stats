import { Navigate, Routes, Route, useSearchParams } from "react-router-dom";
import MapPage from "./pages/MapPage";
import { PopulationDataViewer } from "./components/TestComponent";
import PerfOverlay from "./components/PerfOverlay";

function PerfOverlayIfEnabled() {
  const [params] = useSearchParams();
  return params.get('perf') === '1' ? <PerfOverlay /> : null;
}

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<Navigate to="/map" replace />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/test" element={<PopulationDataViewer />} />
      </Routes>
      <PerfOverlayIfEnabled />
    </>
  );
}
