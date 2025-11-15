import { Button } from "../ui/button";
import { Badge } from "../ui/badge";

interface TopBarProps {
  status: string;
  version: string;
  onRefresh: () => void;
}

const statusColor: Record<string, "default" | "secondary" | "outline"> = {
  ok: "default",
  degraded: "secondary"
};

const TopBar = ({ status, version, onRefresh }: TopBarProps) => {
  const badgeVariant = statusColor[status] ?? "outline";
  return (
    <header className="flex items-center justify-between border-b border-border bg-background/80 px-6 py-4">
      <div>
        <p className="text-sm text-muted-foreground">ClusterCost Local</p>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Live Cost Dashboard</h1>
          <Badge variant={badgeVariant}>{status.toUpperCase()}</Badge>
          <span className="text-xs text-muted-foreground">v{version}</span>
        </div>
      </div>
      <Button variant="secondary" onClick={onRefresh}>
        Refresh
      </Button>
    </header>
  );
};

export default TopBar;
