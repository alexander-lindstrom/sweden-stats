import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import EconomicIndicators from "./pages/EconomicIndicators";
import MapPage from "./pages/MapPage";
import { PopulationDataViewer } from "./components/TestComponent";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/category/economy" element={<EconomicIndicators />} />
      <Route path="/category/map" element={<MapPage />} />
      <Route path="/category/test" element={<PopulationDataViewer />} />
    </Routes>
  );
}