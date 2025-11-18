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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CostByEnvironmentChart } from "../../charts/CostByEnvironmentChart";
import { NamespaceDetailSheet } from "@/components/namespaces/NamespaceDetailSheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";

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

  const prodShare = totalMonthly ? (buckets["Prod"] / totalMonthly) * 100 : 0;
  const nonProdShare = totalMonthly ? (buckets["Non-Prod"] / totalMonthly) * 100 : 0;
  const systemShare = totalMonthly ? (buckets["System"] / totalMonthly) * 100 : 0;

  const costSplitChartData = useMemo(
    () => [
      { environment: "production" as const, value: buckets["Prod"] },
      { environment: "non-prod" as const, value: buckets["Non-Prod"] },
      { environment: "system" as const, value: buckets["System"] }
    ],
    [buckets]
  );

  const quickWins = useMemo(() => {
    const highCostThreshold = sortedByCost[Math.max(0, Math.floor(sortedByCost.length * 0.3) - 1)]?.monthlyCost ?? 0;
    return sortedByCost
      .filter((ns) => ns.monthlyCost >= highCostThreshold && ns.cpuUsagePercent < 35 && ns.memoryUsagePercent < 35)
      .slice(0, 4);
  }, [sortedByCost]);

  const topFive = useMemo(() => sortedByCost.slice(0, 10), [sortedByCost]);
  const quickWinsWaste = useMemo(() => quickWins.reduce((sum, ns) => sum + ns.monthlyCost, 0), [quickWins]);

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

  const insights = useMemo(
    () => [
      topNamespace
        ? {
            title: `${topNamespace.name} is your top namespace`,
            detail: `${formatPercentage(topNamespaceShare, { fractionDigits: 0 })} of total monthly spend`
          }
        : {
            title: "We need more data",
            detail: "Waiting for namespaces to report cost before we can surface insights"
          },
      totalMonthly
        ? {
            title: "Environment mix",
            detail: `Prod ${formatPercentage(prodShare, { fractionDigits: 0 })} · Non-prod ${formatPercentage(
              nonProdShare,
              { fractionDigits: 0 }
            )} · System ${formatPercentage(systemShare, { fractionDigits: 0 })}`
          }
        : {
            title: "No cost data yet",
            detail: "We’ll summarize environment mix once cost data starts flowing"
          },
      quickWins.length
        ? {
            title: `${quickWins.length} savings candidates`,
            detail: `Roughly ${formatCurrency(quickWinsWaste, { maximumFractionDigits: 0 })} /mo tied to low utilization`
          }
        : {
            title: "No obvious waste",
            detail: "CPU and memory utilization look balanced across the most expensive namespaces"
          }
    ],
    [topNamespace, topNamespaceShare, totalMonthly, prodShare, nonProdShare, systemShare, quickWins.length, quickWinsWaste]
  );

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
          <CardHeader className="space-y-1 pb-2">
            <CardTitle>Total monthly cost</CardTitle>
            <CardDescription>Based on live hourly spend</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{formatCurrency(totalMonthly)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardTitle>Top namespace</CardTitle>
            <CardDescription>Single biggest cost center</CardDescription>
          </CardHeader>
          <CardContent>
            {topNamespace ? (
              <div className="space-y-1">
                <p className="text-2xl font-semibold">{topNamespace.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatPercentage(topNamespaceShare, { fractionDigits: 0 })} of monthly spend
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No namespaces yet.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardTitle>Optimization opportunities</CardTitle>
            <CardDescription>High cost, low utilization namespaces</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{quickWins.length}</p>
            <p className="text-xs text-muted-foreground">
              Potential savings ~{formatCurrency(quickWinsWaste, { maximumFractionDigits: 0 })}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="space-y-1 pb-2">
            <CardTitle>Data freshness</CardTitle>
            <CardDescription>{records.length} namespaces reporting</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">{lastUpdated}</p>
            <p className="text-xs text-muted-foreground">relative to current time</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card className="flex flex-col">
          <CardHeader className="items-center pb-0 text-center">
            <CardTitle>Where the money goes</CardTitle>
            <CardDescription>Monthly spend split by environment</CardDescription>
          </CardHeader>
          <CardContent className="flex-1 pb-0">
            <CostByEnvironmentChart data={costSplitChartData} />
          </CardContent>
          <CardFooter className="flex flex-wrap items-center justify-center gap-3 text-xs text-muted-foreground">
            {totalMonthly === 0 ? (
              <span>No spend data yet.</span>
            ) : (
              Object.entries(buckets).map(([label, value]) => (
                <span key={label} className="flex items-center gap-1 rounded-full border border-border px-2 py-1">
                  <span>{label}</span>
                  <span className="font-semibold">{formatPercentage((value / totalMonthly) * 100, { fractionDigits: 0 })}</span>
                </span>
              ))
            )}
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cluster insights</CardTitle>
            <CardDescription>Auto-generated from the last snapshot</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            {insights.map((item, index) => (
              <div key={index} className="flex gap-3">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary" aria-hidden />
                <div>
                  <p className="font-medium text-foreground">{item.title}</p>
                  <p className="text-muted-foreground">{item.detail}</p>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Top namespaces</CardTitle>
            <p className="text-xs text-muted-foreground">Top 10 cost drivers</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {topFive.length === 0 ? (
              <p className="text-sm text-muted-foreground">No namespaces available.</p>
            ) : (
              <div className="overflow-hidden rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead className="w-32 text-right">Cluster share</TableHead>
                      <TableHead className="w-32 text-right">Monthly cost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topFive.map((ns) => {
                      const share = totalMonthly ? (ns.monthlyCost / totalMonthly) * 100 : 0;
                      return (
                        <TableRow
                          key={ns.name}
                          className="cursor-pointer"
                          onClick={() => setSelected(ns)}
                        >
                          <TableCell className="font-medium">{ns.name}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {formatPercentage(share, { fractionDigits: 0 })}
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(ns.monthlyCost)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
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
                <div className="overflow-hidden rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">CPU usage</TableHead>
                        <TableHead className="text-right">Memory usage</TableHead>
                        <TableHead className="text-right">Monthly cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {quickWins.map((ns) => (
                        <TableRow key={ns.name}>
                          <TableCell className="font-medium">{ns.name}</TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {ns.cpuUsagePercent.toFixed(0)}%
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {ns.memoryUsagePercent.toFixed(0)}%
                          </TableCell>
                          <TableCell className="text-right font-semibold">{formatCurrency(ns.monthlyCost)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Spend distribution</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {Object.entries(buckets).map(([label, value]) => {
                const percent = totalMonthly ? (value / totalMonthly) * 100 : 0;
                return (
                  <div key={label} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span>{label}</span>
                      <span>{formatPercentage(percent, { fractionDigits: 0 })}</span>
                    </div>
                    <Progress value={percent} aria-label={`${label} spend`} className="h-2" />
                  </div>
                );
              })}
            </CardContent>
          </Card>
        </div>
      </section>

      <NamespaceDetailSheet open={!!selected} onOpenChange={(open) => !open && setSelected(null)} data={detailSnapshot} />
    </div>
  );
};

export default OverviewPage;
