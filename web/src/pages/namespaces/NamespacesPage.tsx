import { useMemo, useState } from "react";
import { fetchNamespaces, type NamespaceCostRecord } from "../../lib/api";
import { useApiData } from "../../hooks/useApiData";
import {
  formatCurrency,
  formatPercentage,
  toMonthlyCost,
  bytesToGiB,
  milliToCores,
  relativeTimeFromIso,
  type Environment
} from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EnvironmentBadge } from "@/components/environment/EnvironmentBadge";
import { NamespaceDetailSheet, type NamespaceDetailSnapshot } from "@/components/namespaces/NamespaceDetailSheet";
import { CostByEnvironmentChart } from "../../charts/CostByEnvironmentChart";
import { TopNamespacesBarChart } from "../../charts/TopNamespacesBarChart";
import { CostTreemap } from "../../charts/CostTreemap";

interface DerivedNamespace {
  name: string;
  environment: Environment;
  hourlyCost: number;
  monthlyCost: number;
  podCount: number;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  cpuRequestedCores: number;
  cpuUsedCores: number;
  memoryRequestedGiB: number;
  memoryUsedGiB: number;
  labels: Record<string, string>;
}

const getUsagePercent = (used: number, requested: number) => {
  if (!requested) return 0;
  return Math.min(100, (used / requested) * 100);
};

const groupEnvironment = (env: Environment) => {
  if (env === "system") return "System";
  if (env === "production") return "Prod";
  return "Non-Prod";
};

const NamespacesPage = () => {
  const { data, loading, error, refresh } = useApiData(fetchNamespaces);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<DerivedNamespace | null>(null);
  const [unit, setUnit] = useState<"$" | "%">("$");

  const records = data?.records ?? [];
  const derived = useMemo<DerivedNamespace[]>(() => {
    return records.map((record) => {
      const cpuRequested = milliToCores(record.cpuRequestMilli ?? 0);
      const cpuUsed = milliToCores(record.cpuUsageMilli ?? 0);
      const memoryRequested = bytesToGiB(record.memoryRequestBytes ?? 0);
      const memoryUsed = bytesToGiB(record.memoryUsageBytes ?? 0);

      // Use backend provided percent if available, otherwise calculate fallback
      // The backend now provides `record.cpuUsagePercent`
      const cpuPercent = record.cpuUsagePercent ?? getUsagePercent(cpuUsed, cpuRequested);

      return {
        name: record.namespace,
        environment: record.environment ?? "unknown",
        hourlyCost: record.hourlyCost ?? 0,
        monthlyCost: toMonthlyCost(record.hourlyCost ?? 0),
        podCount: record.podCount ?? 0,
        cpuUsagePercent: cpuPercent,
        memoryUsagePercent: getUsagePercent(memoryUsed, memoryRequested),
        cpuRequestedCores: cpuRequested,
        cpuUsedCores: cpuUsed,
        memoryRequestedGiB: memoryRequested,
        memoryUsedGiB: memoryUsed,
        labels: record.labels ?? {}
      };
    });
  }, [records]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return derived;
    return derived.filter((ns) => ns.name.toLowerCase().includes(term));
  }, [derived, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => b.monthlyCost - a.monthlyCost);
  }, [filtered]);

  const totalMonthly = useMemo(() => derived.reduce((sum, ns) => sum + ns.monthlyCost, 0), [derived]);
  const topNamespace = sorted[0];
  const topNamespacePercent = topNamespace && totalMonthly > 0 ? (topNamespace.monthlyCost / totalMonthly) * 100 : 0;

  // Calculate top 5 share based on currently sorted/filtered list
  const topFiveShare = (() => {
    const topFive = sorted.slice(0, 5);
    const share = topFive.reduce((sum, ns) => sum + ns.monthlyCost, 0);
    return totalMonthly > 0 ? (share / totalMonthly) * 100 : 0;
  })();

  const envBreakdown = useMemo(() => {
    const buckets: Record<string, number> = { Prod: 0, "Non-Prod": 0, System: 0 };
    derived.forEach((ns) => {
      const bucket = groupEnvironment(ns.environment);
      buckets[bucket] += ns.monthlyCost;
    });
    return buckets;
  }, [derived]);

  const optimization = useMemo(() => {
    if (!derived.length) return [];
    // Find high cost items (top 25th percentile of cost)
    // sort descending
    const sortedByCost = [...derived].sort((a, b) => b.monthlyCost - a.monthlyCost);
    // arbitrary threshold: items costing more than index 25% * average? 
    // Just pick top spenders with low usage.

    return sortedByCost
      .filter((ns) => ns.monthlyCost > 10 && ns.cpuUsagePercent < 35 && ns.memoryUsagePercent < 35) // Hardcoded $10 threshold for noise
      .slice(0, 5);
  }, [derived]);

  const costByEnvironmentChart = useMemo(() => {
    return [
      { environment: "production" as const, value: envBreakdown["Prod"] },
      { environment: "non-prod" as const, value: envBreakdown["Non-Prod"] },
      { environment: "system" as const, value: envBreakdown["System"] }
    ];
  }, [envBreakdown]);

  // Data for Treemap
  const treemapData = useMemo(() => {
    // Only show top 20 or so to avoid clutter, bundle rest as "Others"?
    // For now just map all
    return sorted.map(ns => ({
      name: ns.name,
      value: unit === "$" ? ns.monthlyCost : (ns.monthlyCost / totalMonthly) * 100,
      formattedValue: unit === "$" ? formatCurrency(ns.monthlyCost) : formatPercentage((ns.monthlyCost / totalMonthly) * 100),
      size: ns.monthlyCost, // Use cost for sizing always? Or match unit? Size usually implies importance (cost)
      originalData: ns
    }));
  }, [sorted, unit, totalMonthly]);

  const lastUpdated = data?.lastUpdated ? relativeTimeFromIso(data.lastUpdated) : "moments ago";

  const detailSnapshot = selected
    ? {
      name: selected.name,
      environment: selected.environment,
      hourlyCost: selected.hourlyCost,
      monthlyCost: selected.monthlyCost,
      podCount: selected.podCount,
      cpuRequested: selected.cpuRequestedCores,
      cpuUsed: selected.cpuUsedCores,
      memoryRequested: selected.memoryRequestedGiB,
      memoryUsed: selected.memoryUsedGiB,
      labels: selected.labels
    }
    : null;

  if (loading && !data) {
    return <Skeleton className="h-[70vh] w-full" />;
  }

  if (error) {
    return (
      <Card className="border-destructive/40 bg-destructive/10">
        <CardContent className="py-10 text-center text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!derived.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No namespaces</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>No namespace costs yet. As soon as data arrives it will show here.</p>
          <Button variant="outline" onClick={refresh} className="w-fit">
            Refresh
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Namespaces</h1>
          <p className="text-sm text-muted-foreground">See where your cluster money goes.</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center rounded-lg border bg-card p-1 text-sm">
            <button
              onClick={() => setUnit("$")}
              className={`rounded px-3 py-1 transition-colors ${unit === "$" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"}`}
            >
              Cost ($)
            </button>
            <button
              onClick={() => setUnit("%")}
              className={`rounded px-3 py-1 transition-colors ${unit === "%" ? "bg-primary text-primary-foreground shadow-sm" : "hover:bg-muted"}`}
            >
              % of Budget
            </button>
          </div>
          <div className="text-sm text-muted-foreground">Last updated {lastUpdated}</div>
        </div>
      </header>

      {/* Main Stats Row */}
      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Total monthly cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatCurrency(totalMonthly)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Top namespace %</CardTitle>
          </CardHeader>
          <CardContent>
            {topNamespace ? (
              <div>
                <p className="text-2xl font-semibold">{topNamespace.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatPercentage(topNamespacePercent, { fractionDigits: 0 })} of spend
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No namespaces yet.</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Prod vs Other</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span>Prod</span>
              <span>{formatPercentage(totalMonthly ? (envBreakdown["Prod"] / totalMonthly) * 100 : 0, { fractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between text-muted-foreground">
              <span>Non-Prod</span>
              <span>{formatPercentage(totalMonthly ? (envBreakdown["Non-Prod"] / totalMonthly) * 100 : 0, { fractionDigits: 0 })}</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Optimization candidates</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{optimization.length}</p>
            <p className="text-xs text-muted-foreground">Wasted CPU/RAM</p>
          </CardContent>
        </Card>
      </section>

      {/* Visualization Row */}
      <section className="grid gap-6 lg:grid-cols-3">
        {/* Treemap takes 2 columns */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Cost Distribution</CardTitle>
            <p className="text-xs text-muted-foreground">Size represents cost relative to total cluster spend.</p>
          </CardHeader>
          <CardContent className="pl-0">
            <CostTreemap data={treemapData} unit={unit} />
          </CardContent>
        </Card>

        {/* Optimization List takes 1 column */}
        <Card>
          <CardHeader>
            <CardTitle>Optimization opportunities</CardTitle>
            <p className="text-xs text-muted-foreground">High cost, low usage targets</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {optimization.length === 0 ? (
              <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
                <p>🎉 All workloads are right-sized!</p>
              </div>
            ) : (
              optimization.map((ns) => (
                <button
                  key={ns.name}
                  className="w-full rounded border border-border/50 bg-card p-3 text-left hover:bg-accent/50"
                  onClick={() => setSelected(ns)}
                >
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-destructive">{ns.name}</span>
                    <span className="font-semibold">{formatCurrency(ns.monthlyCost)}</span>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className={ns.cpuUsagePercent < 20 ? "text-destructive" : ""}>CPU {ns.cpuUsagePercent.toFixed(0)}%</span>
                    <span>·</span>
                    <span className={ns.memoryUsagePercent < 20 ? "text-destructive" : ""}>RAM {ns.memoryUsagePercent.toFixed(0)}%</span>
                  </div>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      {/* Detailed Table Row */}
      <section>
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Namespace Details</CardTitle>
            </div>
            <div className="w-full sm:max-w-xs">
              <Input
                placeholder="Search..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namespace</TableHead>
                  <TableHead>Monthly cost</TableHead>
                  <TableHead>CPU usage</TableHead>
                  <TableHead>Memory usage</TableHead>
                  <TableHead>Environment</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map((ns) => (
                  <TableRow key={ns.name} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelected(ns)}>
                    <TableCell className="font-medium">{ns.name}</TableCell>
                    <TableCell className="whitespace-nowrap">{formatCurrency(ns.monthlyCost)}</TableCell>
                    <TableCell className="w-48">
                      <div className="flex items-center gap-2">
                        <Progress value={ns.cpuUsagePercent} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground w-8 text-right">{ns.cpuUsagePercent.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="w-48">
                      <div className="flex items-center gap-2">
                        <Progress value={ns.memoryUsagePercent} className="h-2 flex-1" />
                        <span className="text-xs text-muted-foreground w-8 text-right">{ns.memoryUsagePercent.toFixed(0)}%</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <EnvironmentBadge environment={ns.environment} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <NamespaceDetailSheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)} data={detailSnapshot} />
    </div>
  );
};

export default NamespacesPage;
