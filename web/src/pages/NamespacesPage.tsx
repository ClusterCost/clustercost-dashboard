import { useEffect, useMemo, useState } from "react";
import { fetchNamespaces, type NamespaceCost } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import Skeleton from "../components/ui/skeleton";
import { Input } from "../components/ui/input";

const NamespacesPage = () => {
  const [namespaces, setNamespaces] = useState<NamespaceCost[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const resp = await fetchNamespaces();
        setNamespaces(resp);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load namespaces");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const filtered = useMemo(() => {
    const term = search.toLowerCase();
    return namespaces
      .filter((ns) =>
        [ns.namespace, ns.team, ns.env].some((value) => value?.toLowerCase().includes(term))
      )
      .sort((a, b) => b.hourlyCost - a.hourlyCost);
  }, [namespaces, search]);

  if (loading) return <Skeleton className="h-72 w-full" />;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-semibold">Namespaces</h2>
          <p className="text-sm text-muted-foreground">Live view by namespace</p>
        </div>
        <Input
          className="w-full md:w-64"
          placeholder="Search namespace, team, env"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Namespace</TableHead>
            <TableHead>Team</TableHead>
            <TableHead>Env</TableHead>
            <TableHead>Hourly Cost</TableHead>
            <TableHead>CPU Req</TableHead>
            <TableHead>CPU Used</TableHead>
            <TableHead>Mem Req</TableHead>
            <TableHead>Mem Used</TableHead>
            <TableHead>Pods</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filtered.map((ns) => (
            <TableRow key={ns.namespace + ns.team + ns.env}>
              <TableCell>{ns.namespace}</TableCell>
              <TableCell>{ns.team || "-"}</TableCell>
              <TableCell>{ns.env || "-"}</TableCell>
              <TableCell>${ns.hourlyCost.toFixed(2)}/hr</TableCell>
              <TableCell>{ns.cpuRequestedCores.toFixed(1)}</TableCell>
              <TableCell>{ns.cpuUsedCores.toFixed(1)}</TableCell>
              <TableCell>{ns.memoryRequestedGiB.toFixed(1)} GiB</TableCell>
              <TableCell>{ns.memoryUsedGiB.toFixed(1)} GiB</TableCell>
              <TableCell>{ns.podCount}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default NamespacesPage;
