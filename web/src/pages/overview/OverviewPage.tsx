import { useMemo, useState } from "react";
import { fetchNamespaces, type NamespaceCostRecord } from "../../lib/api";
import { useApiData } from "../../hooks/useApiData";
import {
  formatCurrency,
  formatPercentage,
  toMonthlyCost,
  milliToCores,
  bytesToGiB,
  relativeTimeFromIso,
  type Environment
} from "../../lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "../../components/ui/card";
import Skeleton from "../../components/ui/skeleton";
import { Button } from "../../components/ui/button";
import { CostByEnvironmentChart } from "../../charts/CostByEnvironmentChart";
import { NamespaceDetailSheet } from "../../components/namespaces/NamespaceDetailSheet";
import { Progress } from "../../components/ui/progress";
import { EnvironmentBadge } from "../../components/environment/EnvironmentBadge";

interface DerivedNamespace {
  name: string;
  hourlyCost: number;
  monthlyCost: number;
  environment: Environment;
  cpuUsagePercent: number;
  memoryUsagePercent: number;
  cpuRequested: number;
  cpuUsed: number;
  memoryRequested: number;
  memoryUsed: number;
  labels: Record<string, string>;
}

const envMap: Record<string, Environment> = {
  prod: "production",
  production: "production",
  nonprod: "development",
  dev: "development",
  development: "development",
  preprod: "preprod",
  system: "system",
  unknown: "unknown"
};

const bucketLabels: Record<Environment | "non-prod", string> = {
  production: "Prod",
  preprod: "Non-Prod",
  development: "Non-Prod",
  system: "System",
  unknown: "Non-Prod",
  "non-prod": "Non-Prod"
};

const OverviewPage = () => {
  const { data, loading, error, refresh } = useApiData(fetchNamespaces);
  const [selected, setSelected] = useState<DerivedNamespace | null>(null);

  const records = data?.records ?? [];

  const derived = useMemo<DerivedNamespace[]>(() => {
    return records.map((record: NamespaceCostRecord) => {
      const environment = envMap[record.environment ?? ""] ?? "unknown";
      const hourlyCost = record.hourlyCost ?? 0;
      const cpuRequested = milliToCores(record.cpuRequestMilli ?? 0);
      const cpuUsed = milliToCores(record.cpuUsageMilli ?? 0);
      const memoryRequested = bytesToGiB(record.memoryRequestBytes ?? 0);
      const memoryUsed = bytesToGiB(record.memoryUsageBytes ?? 0);
      const cpuUsagePercent = cpuRequested > 0 ? Math.min(100, (cpuUsed / cpuRequested) * 100) : 0;
      const memoryUsagePercent = memoryRequested > 0 ? Math.min(100, (memoryUsed / memoryRequested) * 100) : 0;
      return {
        name: record.namespace,
        hourlyCost,
        monthlyCost: toMonthlyCost(hourlyCost),
        environment,
        cpuUsagePercent,
        memoryUsagePercent,
        cpuRequested,
        cpuUsed,
        memoryRequested,
        memoryUsed,
        labels: record.labels ?? {}
      };
    });
  }, [records]);

  const sortedByCost = useMemo(() => [...derived].sort((a, b) => b.monthlyCost - a.monthlyCost), [derived]);
  const totalMonthly = useMemo(() => derived.reduce((sum, ns) => sum + ns.monthlyCost, 0), [derived]);
  const topNamespace = sortedByCost[0];
  const topNamespaceShare = topNamespace && totalMonthly > 0 ? (topNamespace.monthlyCost / totalMonthly) * 100 : 0;

  const buckets = useMemo(() => {
    const result = { Prod: 0, "Non-Prod": 0, System: 0 };
    derived.forEach((ns) => {
      const bucket = ns.environment === "system" ? "System" : ns.environment === "production" ? "Prod" : "Non-Prod";
      result[bucket as keyof typeof result] += ns.monthlyCost;
    });
    return result;
  }, [derived]);

  const quickWins = useMemo(() => {
    const highCostThreshold = sortedByCost[Math.max(0, Math.floor(sortedByCost.length * 0.3) - 1)]?.monthlyCost ?? 0;
    return sortedByCost
      .filter((ns) => ns.monthlyCost >= highCostThreshold && ns.cpuUsagePercent < 35 && ns.memoryUsagePercent < 35)
      .slice(0, 4);
  }, [sortedByCost]);

  const topFive = useMemo(() => sortedByCost.slice(0, 5), [sortedByCost]);

  const costSplitChartData = useMemo(() => (
    [
      { environment: "production" as const, value: buckets["Prod"] },
      { environment: "non-prod" as const, value: buckets["Non-Prod"] },
      { environment: "system" as const, value: buckets["System"] }
    ]
  ), [buckets]);

  const lastUpdated = data?.lastUpdated ? relativeTimeFromIso(data.lastUpdated) : "moments ago";

  const detailSnapshot = selected
    ? {
        name: selected.name,
        environment: selected.environment,
        hourlyCost: selected.hourlyCost,
        monthlyCost: selected.monthlyCost,
        podCount: 0,
        cpuRequested: selected.cpuRequested,
        cpuUsed: selected.cpuUsed,
        memoryRequested: selected.memoryRequested,
        memoryUsed: selected.memoryUsed,
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
          <CardTitle>No data yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>We haven’t received namespace cost data. Check your agent or refresh later.</p>
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
          <h1 className="text-2xl font-semibold">Overview</h1>
          <p className="text-sm text-muted-foreground">Understand your cluster cost at a glance.</p>
        </div>
        <div className="text-sm text-muted-foreground">Last updated {lastUpdated}</div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Total monthly cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{formatCurrency(totalMonthly)}</p>
            <p className="text-xs text-muted-foreground">Based on hourly cost</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Where the money goes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="h-32">
              <CostByEnvironmentChart data={costSplitChartData} />
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Prod {formatPercentage(totalMonthly ? (buckets["Prod"] / totalMonthly) * 100 : 0, { fractionDigits: 0 })}</span>
              <span>Non-Prod {formatPercentage(totalMonthly ? (buckets["Non-Prod"] / totalMonthly) * 100 : 0, { fractionDigits: 0 })}</span>
              <span>System {formatPercentage(totalMonthly ? (buckets["System"] / totalMonthly) * 100 : 0, { fractionDigits: 0 })}</span>
            </div>
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
                  {formatPercentage(topNamespaceShare, { fractionDigits: 0 })} of cluster cost
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No namespaces yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Optimization opportunities</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{quickWins.length}</p>
            <p className="text-xs text-muted-foreground">High cost + low usage</p>
          </CardContent>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card>
          <CardHeader>
            <CardTitle>Top namespaces</CardTitle>
            <p className="text-xs text-muted-foreground">Top 5 cost drivers</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {topFive.map((ns) => (
              <button
                key={ns.name}
                onClick={() => setSelected(ns)}
                className="flex w-full items-center justify-between rounded border border-transparent bg-muted/30 px-3 py-3 text-left transition hover:border-border"
              >
                <div>
                  <p className="font-medium">{ns.name}</p>
                  <p className="text-xs text-muted-foreground">{formatPercentage(totalMonthly ? (ns.monthlyCost / totalMonthly) * 100 : 0, { fractionDigits: 0 })} of total</p>
                </div>
                <span className="text-sm font-semibold">{formatCurrency(ns.monthlyCost)}</span>
              </button>
            ))}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Savings opportunities</CardTitle>
              <p className="text-xs text-muted-foreground">Start here to reduce cost</p>
            </CardHeader>
            <CardContent className="space-y-3">
              {quickWins.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing obvious right now. Keep monitoring.</p>
              ) : (
                quickWins.map((ns) => (
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
              <CardTitle>Spend distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {Object.entries(buckets).map(([label, value]) => (
                <div key={label}>
                  <div className="flex items-center justify-between">
                    <span>{label}</span>
                    <span>{formatPercentage(totalMonthly ? (value / totalMonthly) * 100 : 0, { fractionDigits: 0 })}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${totalMonthly ? (value / totalMonthly) * 100 : 0}%` }}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <NamespaceDetailSheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)} data={detailSnapshot} />
    </div>
  );
};

export default OverviewPage;
