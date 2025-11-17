import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface MetricCardProps {
  label: string;
  value: string;
  helper?: string;
  icon: React.ReactNode;
}

export const MetricCard = ({ label, value, helper, icon }: MetricCardProps) => {
  return (
    <Card className="border-border/60 bg-background/80">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
        <div className="text-primary/80">{icon}</div>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold text-foreground">{value}</p>
        {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
      </CardContent>
    </Card>
  );
};
