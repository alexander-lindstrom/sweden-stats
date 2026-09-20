import { lazy, Suspense } from "react";
import { Navigate, Routes, Route, useSearchParams } from "react-router-dom";
import PerfOverlay from "./components/PerfOverlay";

const MapPage = lazy(() => import("./pages/MapPage"));

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
        </Routes>
      </Suspense>
      <PerfOverlayIfEnabled />
    </>
  );
}
