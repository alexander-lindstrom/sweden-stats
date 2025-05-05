import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import EconomicIndicators from "./pages/EconomicIndicators";
import MapView from "./components/map/MapView";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/category/economy" element={<EconomicIndicators />} />
      <Route path="/category/map" element={<MapView />} />
    </Routes>
  );
}