import { useEffect, useMemo, useState } from "react";
import { fetchOverview, type OverviewResponse } from "../lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import Skeleton from "../components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";

const OverviewPage = () => {
  const [data, setData] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeLabel, setActiveLabel] = useState("");

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const resp = await fetchOverview();
        setData(resp);
        const firstLabel = Object.keys(resp.costByLabel ?? {})[0] ?? "";
        setActiveLabel(firstLabel);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load overview");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const instanceChartData = useMemo(() => {
    const entries = data?.costByInstanceType ?? [];
    return entries.map((item) => ({
      name: item.instanceType,
      cost: item.hourlyCost
    }));
  }, [data]);

  const labelKeys = useMemo(() => {
    if (!data || !data.costByLabel) return [] as string[];
    return Object.keys(data.costByLabel);
  }, [data]);

  if (loading) {
    return <Skeleton className="h-64 w-full" />;
  }

  if (error) {
    return <p className="text-red-400">{error}</p>;
  }

  if (!data) {
    return <p className="text-muted-foreground">No overview data.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{data.provider.toUpperCase()} • {data.region}</p>
        <h2 className="text-2xl font-bold">{data.clusterName}</h2>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Total Hourly Cost</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">${data.totalHourlyCost.toFixed(2)}/hr</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>CPU Requested vs Capacity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {data.totalCpuRequestedCores.toFixed(1)} / {data.totalCpuCores.toFixed(1)} cores
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Memory Requested vs Capacity</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-semibold">
              {data.totalMemoryRequestedGiB.toFixed(1)} / {data.totalMemoryGiB.toFixed(1)} GiB
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top Namespaces</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Namespace</TableHead>
                  <TableHead>Hourly cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data.topNamespaces ?? []).map((ns) => (
                  <TableRow key={ns.namespace}>
                    <TableCell>{ns.namespace}</TableCell>
                    <TableCell>${ns.hourlyCost.toFixed(2)}/hr</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Cost by Instance Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={instanceChartData}>
                  <XAxis dataKey="name" stroke="#94a3b8" />
                  <YAxis stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b" }} />
                  <Bar dataKey="cost" fill="#38bdf8" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Cost by Label</CardTitle>
        </CardHeader>
        <CardContent>
          {labelKeys.length === 0 ? (
            <p className="text-muted-foreground">No labels reported.</p>
          ) : (
            <Tabs value={activeLabel} onValueChange={setActiveLabel} className="w-full">
              <TabsList className="mb-4">
                {labelKeys.map((label) => (
                  <TabsTrigger key={label} value={label} className="capitalize">
                    {label}
                  </TabsTrigger>
                ))}
              </TabsList>
              {labelKeys.map((label) => {
                const entries = data.costByLabel[label] ?? [];
                return (
                  <TabsContent key={label} value={label}>
                    <div className="space-y-2">
                      {entries.length === 0 ? (
                        <p className="text-muted-foreground">No entries for {label}.</p>
                      ) : (
                        entries.map((item) => (
                          <div key={item.value} className="flex items-center justify-between">
                            <span>{item.value}</span>
                            <span>${item.hourlyCost.toFixed(2)}/hr</span>
                          </div>
                        ))
                      )}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default OverviewPage;
