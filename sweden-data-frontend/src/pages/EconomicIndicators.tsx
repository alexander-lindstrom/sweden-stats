import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import KPI from "@/components/KPI";

const tabs = [
  { id: "kpi", label: "KPI Subcategories" },
  { id: "placeholder1", label: "Placeholder Tab 1" },
  { id: "placeholder2", label: "Placeholder Tab 2" },
];

export default function EconomicIndicators() {
  const [activeTab, setActiveTab] = useState("kpi");

  return (
    <main className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-64 bg-gray-100 p-6 border-r">
        <h1 className="text-2xl font-bold mb-6">Economic Indicators</h1>
        <nav className="space-y-2">
          {tabs.map(tab => (
            <Button
              key={tab.id}
              variant={activeTab === tab.id ? "default" : "ghost"}
              className="w-full justify-start"
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </Button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <section className="flex-1 p-8 overflow-y-auto">
        {activeTab === "kpi" && (
          <Card>
            <CardContent className="p-6">
              <h2 className="text-xl font-semibold mb-4">Key Performance Indicator</h2>
              <KPI />
            </CardContent>
          </Card>
        )}

        {activeTab === "placeholder1" && (
          <div className="text-gray-500 text-lg">Placeholder content for Tab 1</div>
        )}

        {activeTab === "placeholder2" && (
          <div className="text-gray-500 text-lg">Placeholder content for Tab 2</div>
        )}
      </section>
    </main>
  );
}
