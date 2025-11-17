import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../ui/sheet";
import { Progress } from "../ui/progress";
import { Badge } from "../ui/badge";
import { formatCurrency } from "../../lib/utils";
import type { NodeCost } from "../../lib/api";

interface NodeDetailSheetProps {
  node: (NodeCost & { monthlyCost: number }) | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const statusStyles: Record<NodeCost["status"], string> = {
  Ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  NotReady: "border-destructive/40 bg-destructive/10 text-destructive",
  Unknown: "border-muted bg-muted/40 text-muted-foreground"
};

const NodeDetailSheet = ({ node, open, onOpenChange }: NodeDetailSheetProps) => {
  if (!node) return null;

  const statusBadge = (
    <Badge variant="outline" className={statusStyles[node.status]}>
      {node.status}
    </Badge>
  );

  const usageSummary = (() => {
    if (node.cpuUsagePercent > 70 || node.memoryUsagePercent > 70) return "Node is heavily used.";
    if (node.cpuUsagePercent < 30 && node.memoryUsagePercent < 30) return "This node is mostly idle.";
    return "Usage looks normal.";
  })();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex flex-col gap-1">
            <span className="text-lg font-semibold">{node.nodeName}</span>
            <span className="text-sm text-muted-foreground">
              {(node.instanceType ?? "Unknown type")} · {node.podCount} pods
            </span>
          </SheetTitle>
          <SheetDescription className="flex items-center gap-2">
            {statusBadge}
            {node.isUnderPressure && <Badge variant="destructive">Under pressure</Badge>}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-5 text-sm">
          <section>
            <p className="text-xs uppercase text-muted-foreground">Monthly cost</p>
            <p className="text-2xl font-semibold">{formatCurrency(node.monthlyCost)}</p>
            <p className="text-xs text-muted-foreground">{formatCurrency(node.hourlyCost, { maximumFractionDigits: 2 })}/hr</p>
          </section>

          <section className="space-y-3">
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>CPU usage</span>
                <span>{node.cpuUsagePercent.toFixed(0)}%</span>
              </div>
              <Progress value={node.cpuUsagePercent} className="mt-2" />
            </div>
            <div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Memory usage</span>
                <span>{node.memoryUsagePercent.toFixed(0)}%</span>
              </div>
              <Progress value={node.memoryUsagePercent} className="mt-2" />
            </div>
          </section>

          <section>
            <p className="text-xs uppercase text-muted-foreground">Status</p>
            <p className="text-sm">{usageSummary}</p>
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default NodeDetailSheet;
