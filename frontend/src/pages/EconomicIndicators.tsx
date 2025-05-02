import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import BackButton from "@/components/BackButton";
import { DashboardComponent } from "@/components/StateEconomy/StateExpenses";
import Kpi from "@/components/Kpi/Kpi";

const tabs = [
  { id: "kpi", label: "KPI" },
  { id: "state_expenses", label: "Statens utgifter" },
];

export default function EconomicIndicators() {
  const [activeTab, setActiveTab] = useState("kpi");

  return (
    <main className="flex h-screen">
      <aside className="w-64 bg-gray-100 p-6 border-r">
        <div className="mb-6">
          <BackButton to="/" label="Home" />
          <h1 className="text-2xl font-bold mt-4">Ekonomi</h1>
        </div>
        <nav>
          {tabs.map((tab, index) => (
            <div key={tab.id}>
              <Button
                variant="ghost"
                className={`w-full justify-start text-left ${
                  activeTab === tab.id
                    ? "bg-blue-100 text-blue-800 font-semibold border-l-4 border-blue-500"
                    : "text-gray-800"
                }`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
            </Button>

              {index < tabs.length - 1 && (
                <div className="h-px bg-gray-200 my-2" />
              )}
            </div>
          ))}
        </nav>
      </aside>
  
      <section className="flex-1 p-8 overflow-y-auto">
        <div className="h-full">
          <Card className="h-full">
            <CardContent className="p-6 h-full">
              {activeTab === "kpi" && (
                <div className="h-full">
                  <Kpi />
                </div>
              )}

              {activeTab === "state_expenses" && (
                <div className="h-full">
                  <DashboardComponent />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}