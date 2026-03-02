import { Navigate, Routes, Route } from "react-router-dom";
import MapPage from "./pages/MapPage";
import { PopulationDataViewer } from "./components/TestComponent";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/map" replace />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/test" element={<PopulationDataViewer />} />
    </Routes>
  );
}
