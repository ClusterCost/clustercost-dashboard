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

  const records = data?.records ?? [];
  const derived = useMemo<DerivedNamespace[]>(() => {
    return records.map((record) => {
      const cpuRequested = milliToCores(record.cpuRequestMilli ?? 0);
      const cpuUsed = milliToCores(record.cpuUsageMilli ?? 0);
      const memoryRequested = bytesToGiB(record.memoryRequestBytes ?? 0);
      const memoryUsed = bytesToGiB(record.memoryUsageBytes ?? 0);
      return {
        name: record.namespace,
        environment: record.environment ?? "unknown",
        hourlyCost: record.hourlyCost ?? 0,
        monthlyCost: toMonthlyCost(record.hourlyCost ?? 0),
        podCount: record.podCount ?? 0,
        cpuUsagePercent: getUsagePercent(cpuUsed, cpuRequested),
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
    const costThreshold = [...derived].sort((a, b) => b.monthlyCost - a.monthlyCost)[Math.max(Math.floor(derived.length * 0.25) - 1, 0)]?.monthlyCost ?? 0;
    return derived
      .filter((ns) => ns.monthlyCost >= costThreshold && ns.cpuUsagePercent < 35 && ns.memoryUsagePercent < 35)
      .sort((a, b) => b.monthlyCost - a.monthlyCost)
      .slice(0, 5);
  }, [derived]);

  const costByEnvironmentChart = useMemo(() => {
    return [
      { environment: "production" as const, value: envBreakdown["Prod"] },
      { environment: "non-prod" as const, value: envBreakdown["Non-Prod"] },
      { environment: "system" as const, value: envBreakdown["System"] }
    ];
  }, [envBreakdown]);

  const topFiveChart = useMemo(() => {
    return sorted.slice(0, 5).map((ns) => ({ name: ns.name, value: ns.monthlyCost }));
  }, [sorted]);

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
        <div className="text-sm text-muted-foreground">Last updated {lastUpdated}</div>
      </header>

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
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Prod vs Non-prod vs System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <p>Prod {formatPercentage(totalMonthly ? (envBreakdown["Prod"] / totalMonthly) * 100 : 0, { fractionDigits: 0 })}</p>
            <p>Non-prod {formatPercentage(totalMonthly ? (envBreakdown["Non-Prod"] / totalMonthly) * 100 : 0, { fractionDigits: 0 })}</p>
            <p>System {formatPercentage(totalMonthly ? (envBreakdown["System"] / totalMonthly) * 100 : 0, { fractionDigits: 0 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Optimization targets</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{optimization.length}</p>
            <p className="text-xs text-muted-foreground">High spend, low usage</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Namespaces</CardTitle>
              <p className="text-xs text-muted-foreground">Top 5 = {formatPercentage(topFiveShare, { fractionDigits: 0 })} of total</p>
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="Search namespaces"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-9 w-full max-w-xs"
              />
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="hidden lg:block">
              <div className="overflow-hidden rounded-md border">
                <div className="overflow-x-auto">
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
                        <TableRow key={ns.name} className="cursor-pointer" onClick={() => setSelected(ns)}>
                          <TableCell className="font-medium">{ns.name}</TableCell>
                          <TableCell className="whitespace-nowrap">{formatCurrency(ns.monthlyCost)}</TableCell>
                          <TableCell className="w-48">
                            <div className="flex items-center gap-2">
                              <Progress value={ns.cpuUsagePercent} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground">{ns.cpuUsagePercent.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="w-48">
                            <div className="flex items-center gap-2">
                              <Progress value={ns.memoryUsagePercent} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground">{ns.memoryUsagePercent.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <EnvironmentBadge environment={ns.environment} />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
            <div className="space-y-3 lg:hidden">
              {sorted.map((ns) => (
                <button
                  key={ns.name}
                  onClick={() => setSelected(ns)}
                  className="w-full rounded-md border border-border/60 p-3 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{ns.name}</p>
                      <p className="text-xs text-muted-foreground">{ns.environment}</p>
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(ns.monthlyCost)}</span>
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                    <p>CPU {ns.cpuUsagePercent.toFixed(0)}%</p>
                    <Progress value={ns.cpuUsagePercent} className="h-1.5" />
                    <p className="mt-1">Memory {ns.memoryUsagePercent.toFixed(0)}%</p>
                    <Progress value={ns.memoryUsagePercent} className="h-1.5" />
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Optimization opportunities</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {optimization.length === 0 ? (
                <p className="text-sm text-muted-foreground">Everything looks right-sized right now.</p>
              ) : (
                optimization.map((ns) => (
                  <div key={ns.name} className="rounded border border-border/60 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{ns.name}</span>
                      <span>{formatCurrency(ns.monthlyCost)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      CPU {ns.cpuUsagePercent.toFixed(0)}% · Memory {ns.memoryUsagePercent.toFixed(0)}%
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost concentration</CardTitle>
              <p className="text-xs text-muted-foreground">Where your money goes</p>
            </CardHeader>
            <CardContent>
              <CostByEnvironmentChart data={costByEnvironmentChart} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Top namespaces by cost</CardTitle>
            </CardHeader>
            <CardContent>
              {topFiveChart.length > 0 ? (
                <TopNamespacesBarChart data={topFiveChart} />
              ) : (
                <p className="text-sm text-muted-foreground">We need namespace cost data before showing this chart.</p>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <NamespaceDetailSheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)} data={detailSnapshot} />
    </div>
  );
};

export default NamespacesPage;
