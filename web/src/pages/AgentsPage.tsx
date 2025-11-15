import { useEffect, useState } from "react";
import { fetchAgents, type AgentInfo } from "../lib/api";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import Skeleton from "../components/ui/skeleton";
import { Badge } from "../components/ui/badge";

const AgentsPage = () => {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const resp = await fetchAgents();
        setAgents(resp);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load agents");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) return <Skeleton className="h-48 w-full" />;
  if (error) return <p className="text-red-400">{error}</p>;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Agents</h2>
        <p className="text-sm text-muted-foreground">Configured collectors and scrape status</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Base URL</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Last Scrape</TableHead>
            <TableHead>Error</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {agents.map((agent) => (
            <TableRow key={agent.name}>
              <TableCell>{agent.name}</TableCell>
              <TableCell className="font-mono text-xs">{agent.baseUrl}</TableCell>
              <TableCell>
                <Badge variant={agent.status === "healthy" ? "default" : "secondary"}>{agent.status}</Badge>
              </TableCell>
              <TableCell>{agent.lastScrapeTime ? new Date(agent.lastScrapeTime).toLocaleTimeString() : "-"}</TableCell>
              <TableCell className="text-xs text-muted-foreground">{agent.error || ""}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AgentsPage;
