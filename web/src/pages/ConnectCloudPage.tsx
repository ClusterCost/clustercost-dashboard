import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

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
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Connect to ClusterCost Cloud</h2>
        <p className="text-muted-foreground">
          Unlock collaboration, automation, and cost intelligence across every cluster.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Why upgrade</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-6">
            {features.map((feature) => (
              <li key={feature}>{feature}</li>
            ))}
          </ul>
          <div className="mt-6 flex gap-2">
            <Button>Learn more</Button>
            <Button variant="secondary">Request access</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default ConnectCloudPage;
