import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const features = [
  "30–180 day history",
  "Multi-cluster & multi-account",
  "Forecasting and anomaly detection",
  "Rightsizing recommendations",
  "Alerts via Slack/Teams/Email",
  "Teams, orgs, RBAC, SSO"
];

const ConnectCloudPage = () => {
  return (
    <div className="px-8 md:px-12 py-10 max-w-3xl">
      <header>
        <h1 className="text-2xl font-semibold">Connect to ClusterCost Cloud</h1>
        <p className="mt-1 text-muted-foreground">
          Unlock collaboration, automation, and cost intelligence across every cluster.
        </p>
      </header>

      <div className="border-t border-border/50 mt-4 pt-6">
        <Card className="border border-border/50 bg-background rounded-xl">
          <div className="p-6 md:p-8">
            <h2 className="text-lg font-medium mb-4">Why upgrade</h2>
            <ul className="space-y-2 list-disc pl-6 text-sm text-muted-foreground">
              {features.map((feature) => (
                <li key={feature}>{feature}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3 mt-6">
              <Button variant="outline" size="lg" className="px-8" asChild>
                <a href="#">Learn more</a>
              </Button>
              <Button variant="secondary" size="lg" className="px-8" asChild>
                <a href="#">Request access</a>
              </Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default ConnectCloudPage;
