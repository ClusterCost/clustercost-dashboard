import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Progress } from "../ui/progress";
import { Badge } from "../ui/badge";
import { EnvironmentBadge } from "../environment/EnvironmentBadge";
import { formatCurrency, type Environment } from "../../lib/utils";

export interface NamespaceDetailSnapshot {
  name: string;
  environment: Environment;
  hourlyCost: number;
  monthlyCost: number;
  podCount: number;
  cpuRequested: number;
  cpuUsed: number;
  memoryRequested: number;
  memoryUsed: number;
  labels: Record<string, string>;
}

interface NamespaceDetailSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: NamespaceDetailSnapshot | null;
}

const formatUsageLabel = (used: number, requested: number, unit: string) => {
  if (!requested) return `No requests`;
  return `${used.toFixed(2)} ${unit} of ${requested.toFixed(2)} ${unit}`;
};

const NamespaceDetailSheet = ({ open, onOpenChange, data }: NamespaceDetailSheetProps) => {
  if (!data) return null;

  const cpuPercent = data.cpuRequested > 0 ? Math.min(100, (data.cpuUsed / data.cpuRequested) * 100) : 0;
  const memoryPercent = data.memoryRequested > 0 ? Math.min(100, (data.memoryUsed / data.memoryRequested) * 100) : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-start justify-between gap-3">
            <div>
              <p className="text-lg font-semibold">{data.name}</p>
              <p className="text-xs text-muted-foreground">{data.podCount} pods · {formatCurrency(data.monthlyCost)}/mo</p>
            </div>
            <EnvironmentBadge environment={data.environment} />
          </SheetTitle>
          <SheetDescription>Quick namespace context for optimization decisions.</SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6 text-sm">
          <section>
            <p className="text-xs uppercase text-muted-foreground">Cost</p>
            <p className="text-2xl font-semibold">{formatCurrency(data.monthlyCost)}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(data.hourlyCost, { maximumFractionDigits: 2 })}/hr</p>
          </section>

          <section className="space-y-4">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>CPU usage</span>
                <span>{formatUsageLabel(data.cpuUsed, data.cpuRequested, "cores")}</span>
              </div>
              <Progress value={cpuPercent} className="mt-2" />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Memory usage</span>
                <span>{formatUsageLabel(data.memoryUsed, data.memoryRequested, "GiB")}</span>
              </div>
              <Progress value={memoryPercent} className="mt-2" />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold">Labels</p>
              <Badge variant="outline" className="text-xs">{Object.keys(data.labels ?? {}).length || 0}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.keys(data.labels ?? {}).length === 0 && (
                <p className="text-xs text-muted-foreground">No labels reported.</p>
              )}
              {Object.entries(data.labels ?? {}).map(([key, value]) => (
                <Badge key={key} variant="outline" className="border-border/60 text-xs">
                  {key}: {value}
                </Badge>
              ))}
            </div>
          </section>

        </div>
      </SheetContent>
    </Sheet>
  );
};

export { NamespaceDetailSheet };
export type { NamespaceDetailSheetProps };
export default NamespaceDetailSheet;
