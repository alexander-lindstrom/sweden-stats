import { lazy, Suspense } from "react";
import { Navigate, Routes, Route, useSearchParams } from "react-router-dom";
import PerfOverlay from "./components/PerfOverlay";

const MapPage = lazy(() => import("./pages/MapPage"));
const PopulationDataViewer = lazy(() =>
  import("./components/TestComponent").then(m => ({ default: m.PopulationDataViewer }))
);

function PerfOverlayIfEnabled() {
  const [params] = useSearchParams();
  return params.get('perf') === '1' ? <PerfOverlay /> : null;
}

export default function App() {
  return (
    <>
      <Suspense fallback={null}>
        <Routes>
          <Route path="/" element={<Navigate to="/map" replace />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/test" element={<PopulationDataViewer />} />
        </Routes>
      </Suspense>
      <PerfOverlayIfEnabled />
    </>
  );
}
