import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";

const categories = [
  { id: "map", title: "Map view", description: "Map view" },
  { id: "economy", title: "Economic Indicators", description: "Visualize trends and regional economic indicators." },
  { id: "education", title: "Education Levels", description: "Compare education levels by region or municipality." }
];

export default function LandingPage() {
  return (
    <main className="p-8">
      <h1 className="text-4xl font-bold mb-4">Sweden Data Visualizer</h1>
      <p className="mb-8 text-muted-foreground">Interactive visualizations of public data from SCB and other sources.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {categories.map(cat => (
          <Card key={cat.id}>
            <CardContent className="p-4">
              <h2 className="text-xl font-semibold mb-2">{cat.title}</h2>
              <p className="text-sm text-muted-foreground mb-4">{cat.description}</p>
              <Button variant="outline" asChild>
                <Link to={`/category/${cat.id}`}>Explore</Link>
            </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}