import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import StateExpenses from "@/components/StateEconomy/StateExpenses";
import Kpi from "@/components/Kpi/Kpi";
import BackButton from "@/components/BackButton";
import StateRevenues from "@/components/StateEconomy/StateRevenue";

const tabs = [
  { id: "kpi", label: "KPI" },
  { id: "state_expenses", label: "Statens utgifter" },
  { id: "state_revenue", label: "Statens inkomster" },
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
                variant={activeTab === tab.id ? "default" : "ghost"}
                className="w-full justify-start"
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
                  <StateExpenses />
                </div>
              )}
  
              {activeTab === "state_revenue" && (
                <div className="h-full">
                  <StateRevenues />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </main>
  );
}