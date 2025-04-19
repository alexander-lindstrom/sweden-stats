import { Routes, Route } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import EconomicIndicators from "./pages/EconomicIndicators";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/category/economy" element={<EconomicIndicators />} />
      {/* Future routes for other category pages */}
    </Routes>
  );
}