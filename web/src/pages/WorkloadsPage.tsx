import { useEffect, useMemo, useState } from "react";
import { fetchWorkloads, type WorkloadCost } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import Skeleton from "../components/ui/skeleton";
import { Input } from "../components/ui/input";

const WorkloadsPage = () => {
  const [workloads, setWorkloads] = useState<WorkloadCost[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const resp = await fetchWorkloads();
        setWorkloads(resp);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load workloads");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = filter.toLowerCase();
    return workloads
      .filter((wl) =>
        [wl.namespace, wl.team, wl.env, wl.workloadName].some((value) =>
          value?.toLowerCase().includes(term)
        )
      )
      .sort((a, b) => b.hourlyCost - a.hourlyCost);
  }, [workloads, filter]);

  if (loading) return <Skeleton className="h-72 w-full" />;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Workloads</h2>
          <p className="text-sm text-muted-foreground">Aggregated per workload</p>
        </div>
        <Input
          className="w-full md:w-64"
          placeholder="Filter by namespace, team, env"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Namespace</TableHead>
            <TableHead>Kind</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Env</TableHead>
            <TableHead>Replicas</TableHead>
            <TableHead>Hourly Cost</TableHead>
            <TableHead>CPU Req/Used</TableHead>
            <TableHead>Mem Req/Used</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((wl) => (
            <TableRow key={`${wl.namespace}-${wl.workloadName}`}>
              <TableCell>{wl.namespace}</TableCell>
              <TableCell>{wl.workloadKind}</TableCell>
              <TableCell>{wl.workloadName}</TableCell>
              <TableCell>{wl.team || "-"}</TableCell>
              <TableCell>{wl.env || "-"}</TableCell>
              <TableCell>{wl.replicas}</TableCell>
              <TableCell>${wl.hourlyCost.toFixed(2)}/hr</TableCell>
              <TableCell>
                {wl.cpuRequestedCores.toFixed(1)} / {wl.cpuUsedCores.toFixed(1)} cores
              </TableCell>
              <TableCell>
                {wl.memoryRequestedGiB.toFixed(1)} / {wl.memoryUsedGiB.toFixed(1)} GiB
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default WorkloadsPage;
