import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import KPI from "@/components/KPI/KPI";
import StateExpenses from "@/components/StateExpenses/StateExpenses";

const tabs = [
  { id: "kpi", label: "KPI" },
  { id: "state_expenses", label: "Statens utgifter" },
  { id: "placeholder2", label: "Placeholder Tab 2" },
];

export default function EconomicIndicators() {
  const [activeTab, setActiveTab] = useState("kpi");

  return (
    <main className="flex h-screen">
      <aside className="w-64 bg-gray-100 p-6 border-r">
        <h1 className="text-2xl font-bold mb-6">Ekonomi</h1>
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

      <section className="flex-1 p-8 overflow-y-auto">
        <div className="h-full">
          <Card className="h-full">
            <CardContent className="p-6 h-full">
              {activeTab === "kpi" && (
                <div className="h-full">
                  <KPI />
                </div>
              )}

              {activeTab === "state_expenses" && (
                <div className="h-full">
                  <StateExpenses />
                </div>
              )}

              {activeTab === "placeholder2" && (
                <div className="h-full flex items-center justify-center text-gray-500 text-lg">
                  Placeholder content for Tab 2
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}
