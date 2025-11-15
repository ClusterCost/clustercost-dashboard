import { useEffect, useMemo, useState } from "react";
import { fetchNodes, type NodeCost } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip } from "recharts";
import Skeleton from "../components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

const NodesPage = () => {
  const [nodes, setNodes] = useState<NodeCost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const resp = await fetchNodes();
        setNodes(resp);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load nodes");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const costByType = useMemo(() => {
    const map = new Map<string, number>();
    nodes.forEach((node) => {
      map.set(node.instanceType, (map.get(node.instanceType) ?? 0) + node.allocatedCostHourly);
    });
    return Array.from(map.entries()).map(([type, cost]) => ({ type, cost }));
  }, [nodes]);

  if (loading) return <Skeleton className="h-72 w-full" />;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Nodes</h2>
        <p className="text-sm text-muted-foreground">Capacity and allocation by node</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Cost by instance type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={costByType}>
                  <XAxis dataKey="type" stroke="#94a3b8" />
                  <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b" }} />
                  <Bar dataKey="cost" fill="#a78bfa" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Instance</TableHead>
            <TableHead>AZ</TableHead>
            <TableHead>Raw Price</TableHead>
            <TableHead>Allocated</TableHead>
            <TableHead>CPU (req/alloc)</TableHead>
            <TableHead>Mem (req/alloc)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {nodes.map((node) => (
            <TableRow key={node.name}>
              <TableCell>{node.name}</TableCell>
              <TableCell>{node.instanceType}</TableCell>
              <TableCell>{node.availabilityZone}</TableCell>
              <TableCell>${node.rawNodePriceHourly.toFixed(3)}/hr</TableCell>
              <TableCell>${node.allocatedCostHourly.toFixed(3)}/hr</TableCell>
              <TableCell>
                {node.cpuRequestedCores.toFixed(1)} / {node.cpuAllocatableCores.toFixed(1)} cores
              </TableCell>
              <TableCell>
                {node.memoryRequestedGiB.toFixed(1)} / {node.memoryAllocatableGiB.toFixed(1)} GiB
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default NodesPage;
