import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const benefits = [
  { title: "Multi-cluster view", subtitle: "Every cluster, one dashboard." },
  { title: "Cost history & trends", subtitle: "See how costs evolve over time." },
  { title: "Alerts & savings", subtitle: "Know when spend spikes and where to cut waste." }
];

const ConnectCloudPage = () => {
  return (
    <div className="mx-auto max-w-5xl space-y-8 px-4 py-10">
      <section className="space-y-3 text-center">
        <Badge variant="secondary" className="mx-auto w-fit">
          Coming soon
        </Badge>
        <h1 className="text-3xl font-semibold">ClusterCost Cloud</h1>
        <p className="text-muted-foreground">Centralize your cluster costs, history, and alerts in one place.</p>
        <Button size="lg" asChild>
          <a href="#">Join Cloud Waitlist</a>
        </Button>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {benefits.map((benefit) => (
          <Card key={benefit.title}>
            <CardHeader>
              <CardTitle className="text-base font-semibold">{benefit.title}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">{benefit.subtitle}</CardContent>
          </Card>
        ))}
      </section>

      <p className="text-center text-sm text-muted-foreground">
        Open Source is perfect for individuals. Cloud is built for teams.
      </p>

      <p className="text-center text-xs text-muted-foreground">
        We only use minimal metadata to power cost insights. No logs, no sensitive pod data.
      </p>
    </div>
  );
};

export default ConnectCloudPage;
