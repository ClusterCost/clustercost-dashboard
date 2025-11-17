import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";

interface InsightItem {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface InsightsCardProps {
  title: string;
  subtitle?: string;
  items: InsightItem[];
}

export const InsightsCard = ({ title, subtitle, items }: InsightsCardProps) => (
  <Card className="border-border/60 bg-background/80">
    <CardHeader>
      <CardTitle className="text-base font-semibold">{title}</CardTitle>
      {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
    </CardHeader>
    <CardContent className="space-y-4">
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No insights available.</p>
      ) : (
        items.map((item) => (
          <div key={item.title} className="flex flex-col gap-1 rounded-md border border-border/60 bg-muted/10 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">{item.title}</p>
              {item.actionLabel && item.onAction && (
                <Button variant="ghost" className="h-auto px-2 py-0 text-xs" onClick={item.onAction}>
                  {item.actionLabel}
                </Button>
              )}
            </div>
            <p className="text-xs text-muted-foreground">{item.description}</p>
          </div>
        ))
      )}
    </CardContent>
  </Card>
);
