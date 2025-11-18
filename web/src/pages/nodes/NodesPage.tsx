import { useMemo, useState, type ChangeEvent } from "react";
import { fetchNodes, type NodeCost } from "../../lib/api";
import { formatCurrency, formatPercentage, relativeTimeFromIso, toMonthlyCost } from "../../lib/utils";
import { useApiData } from "../../hooks/useApiData";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import NodeDetailSheet from "@/components/nodes/NodeDetailSheet";

const statusStyles: Record<NodeCost["status"], string> = {
  Ready: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  NotReady: "border-destructive/40 bg-destructive/10 text-destructive",
  Unknown: "border-muted bg-muted/40 text-muted-foreground"
};

type SortKey = "cost" | "cpu" | "memory";

const NodesPage = () => {
  const { data, loading, error, refresh } = useApiData(fetchNodes);
  const nodes = data ?? [];
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("cost");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [selectedNode, setSelectedNode] = useState<(NodeCost & { monthlyCost: number }) | null>(null);

  const derivedNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      cpuUsagePercent: node.cpuUsagePercent ?? 0,
      memoryUsagePercent: node.memoryUsagePercent ?? 0,
      hourlyCost: node.hourlyCost ?? 0,
      monthlyCost: toMonthlyCost(node.hourlyCost ?? 0)
    }));
  }, [nodes]);

  const summary = useMemo(() => {
    const totalMonthly = derivedNodes.reduce((sum, node) => sum + node.monthlyCost, 0);
    const avgCpu = derivedNodes.length
      ? derivedNodes.reduce((sum, node) => sum + node.cpuUsagePercent, 0) / derivedNodes.length
      : 0;
    const avgMem = derivedNodes.length
      ? derivedNodes.reduce((sum, node) => sum + node.memoryUsagePercent, 0) / derivedNodes.length
      : 0;
    const issueCount = derivedNodes.filter((node) => node.status !== "Ready" || node.isUnderPressure).length;
    return { totalMonthly, avgCpu, avgMem, ready: derivedNodes.length - issueCount, issues: issueCount };
  }, [derivedNodes]);

  const filteredNodes = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return derivedNodes;
    return derivedNodes.filter((node) => node.nodeName.toLowerCase().includes(term));
  }, [derivedNodes, search]);

  const sortedNodes = useMemo(() => {
    const rows = [...filteredNodes];
    const valueFor = (node: (typeof derivedNodes)[number]) => {
      if (sortKey === "cpu") return node.cpuUsagePercent;
      if (sortKey === "memory") return node.memoryUsagePercent;
      return node.monthlyCost;
    };
    rows.sort((a, b) => {
      const diff = valueFor(a) - valueFor(b);
      return sortDirection === "asc" ? diff : -diff;
    });
    return rows;
  }, [filteredNodes, sortKey, sortDirection]);

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDirection((dir) => (dir === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDirection("desc");
    }
  };

  const optimizationCandidates = useMemo(() => {
    if (!derivedNodes.length) return [];
    const sortedCosts = [...derivedNodes].sort((a, b) => b.monthlyCost - a.monthlyCost);
    const index = Math.max(0, Math.floor(sortedCosts.length * 0.3) - 1);
    const costThreshold = sortedCosts[index]?.monthlyCost ?? 0;
    return derivedNodes
      .filter(
        (node) =>
          node.monthlyCost >= costThreshold && node.cpuUsagePercent < 35 && node.memoryUsagePercent < 35
      )
      .sort((a, b) => b.monthlyCost - a.monthlyCost)
      .slice(0, 5);
  }, [derivedNodes]);

  const alerts = useMemo(() => {
    return derivedNodes
      .map((node) => {
        const reasons: string[] = [];
        if (node.status !== "Ready") reasons.push(node.status);
        if (node.cpuUsagePercent >= 85) reasons.push(`CPU ${node.cpuUsagePercent.toFixed(0)}%`);
        if (node.memoryUsagePercent >= 85) reasons.push(`Memory ${node.memoryUsagePercent.toFixed(0)}%`);
        if (node.isUnderPressure) reasons.push("Under pressure");
        return { node, reasons };
      })
      .filter((item) => item.reasons.length > 0)
      .slice(0, 5);
  }, [derivedNodes]);

  const lastUpdatedLabel = data?.[0]?.lastUpdated ? relativeTimeFromIso(data[0].lastUpdated) : "moments ago";

  const renderSortLabel = (key: SortKey, label: string) => (
    <button
      className="flex items-center gap-1 text-left text-xs font-medium uppercase tracking-wide text-muted-foreground"
      onClick={() => handleSort(key)}
    >
      {label}
      {sortKey === key && <span>{sortDirection === "desc" ? "↓" : "↑"}</span>}
    </button>
  );

  if (loading && !data) {
    return <Skeleton className="h-[70vh] w-full" />;
  }

  if (error) {
    return (
      <Card className="border-destructive/30 bg-destructive/5">
        <CardContent className="py-10 text-center text-sm text-destructive">{error}</CardContent>
      </Card>
    );
  }

  if (!derivedNodes.length) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No nodes</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>We couldn’t find any nodes. Once data arrives it will show up here.</p>
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
          <h1 className="text-2xl font-semibold">Nodes</h1>
          <p className="text-sm text-muted-foreground">See how much each node costs and how full it is.</p>
        </div>
        <div className="text-sm text-muted-foreground">Last updated {lastUpdatedLabel}</div>
      </header>

      <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Total node cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatCurrency(summary.totalMonthly)}</p>
            <p className="text-xs text-muted-foreground">Monthly (hourly x 30 days)</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Avg CPU usage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatPercentage(summary.avgCpu, { fractionDigits: 0 })}</p>
            <Progress value={summary.avgCpu} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Avg memory usage</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">{formatPercentage(summary.avgMem, { fractionDigits: 0 })}</p>
            <Progress value={summary.avgMem} className="mt-2" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground">Node health</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">
              {summary.ready} Ready · {summary.issues} With issues
            </p>
            <p className="text-xs text-muted-foreground">Issues = NotReady or under pressure</p>
          </CardContent>
        </Card>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle>Nodes</CardTitle>
              <p className="text-sm text-muted-foreground">Sorted by monthly cost</p>
            </div>
            <div className="w-full sm:max-w-xs">
              <Input
                placeholder="Search nodes"
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
                className="h-9 w-full"
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
                        <TableHead className="min-w-[200px]">Node</TableHead>
                        <TableHead>{renderSortLabel("cost", "Monthly cost")}</TableHead>
                        <TableHead>{renderSortLabel("cpu", "CPU usage")}</TableHead>
                        <TableHead>{renderSortLabel("memory", "Memory usage")}</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedNodes.map((node) => (
                        <TableRow key={node.nodeName} className="cursor-pointer" onClick={() => setSelectedNode(node)}>
                          <TableCell>
                            <div className="flex flex-col gap-1">
                              <span className="font-medium">{node.nodeName}</span>
                              {node.instanceType && (
                                <span className="w-fit rounded bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
                                  {node.instanceType}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-medium">
                            {formatCurrency(node.monthlyCost)}
                          </TableCell>
                          <TableCell className="w-48">
                            <div className="flex items-center gap-2 text-sm">
                              <Progress value={node.cpuUsagePercent} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground">{node.cpuUsagePercent.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell className="w-48">
                            <div className="flex items-center gap-2 text-sm">
                              <Progress value={node.memoryUsagePercent} className="h-2 flex-1" />
                              <span className="text-xs text-muted-foreground">{node.memoryUsagePercent.toFixed(0)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={statusStyles[node.status]} variant="outline">
                              {node.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
            <div className="space-y-3 lg:hidden">
              {sortedNodes.map((node) => (
                <button
                  key={node.nodeName}
                  onClick={() => setSelectedNode(node)}
                  className="w-full rounded-md border border-border/60 p-3 text-left"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold">{node.nodeName}</p>
                      {node.instanceType && (
                        <p className="text-xs text-muted-foreground">{node.instanceType}</p>
                      )}
                    </div>
                    <span className="text-sm font-semibold">{formatCurrency(node.monthlyCost)}</span>
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                    <div>
                      <p>CPU {node.cpuUsagePercent.toFixed(0)}%</p>
                      <Progress value={node.cpuUsagePercent} className="mt-1 h-1.5" />
                    </div>
                    <div>
                      <p>Mem {node.memoryUsagePercent.toFixed(0)}%</p>
                      <Progress value={node.memoryUsagePercent} className="mt-1 h-1.5" />
                    </div>
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-xs">
                    <Badge className={statusStyles[node.status]} variant="outline">
                      {node.status}
                    </Badge>
                    {node.isUnderPressure && <Badge variant="destructive">Pressure</Badge>}
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Optimization ideas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {optimizationCandidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Looks good, no obvious wasted nodes right now.</p>
              ) : (
                optimizationCandidates.map((node) => (
                  <div key={node.nodeName} className="rounded border border-border/60 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{node.nodeName}</span>
                      <span>{formatCurrency(node.monthlyCost)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {node.cpuUsagePercent.toFixed(0)}% CPU · {node.memoryUsagePercent.toFixed(0)}% Mem
                    </p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.length === 0 ? (
                <p className="text-sm text-muted-foreground">All nodes healthy.</p>
              ) : (
                alerts.map(({ node, reasons }) => (
                  <div key={node.nodeName} className="rounded border border-border/60 p-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{node.nodeName}</span>
                      <Badge variant="destructive">Check</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">{reasons.join(" · ")}</p>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      <NodeDetailSheet
        node={selectedNode}
        open={!!selectedNode}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedNode(null);
          }
        }}
      />
    </div>
  );
};

export default NodesPage;
