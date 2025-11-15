export interface OverviewResponse {
  clusterName: string;
  provider: string;
  region: string;
  totalHourlyCost: number;
  totalCpuCores: number;
  totalCpuRequestedCores: number;
  totalMemoryGiB: number;
  totalMemoryRequestedGiB: number;
  topNamespaces: Array<{ namespace: string; hourlyCost: number }>;
  costByLabel: Record<string, Array<{ value: string; hourlyCost: number }>>;
  costByInstanceType: Array<{ instanceType: string; nodeCount: number; hourlyCost: number }>;
}

export interface NamespaceCost {
  namespace: string;
  team: string;
  env: string;
  hourlyCost: number;
  cpuRequestedCores: number;
  cpuUsedCores: number;
  memoryRequestedGiB: number;
  memoryUsedGiB: number;
  podCount: number;
}

export interface NodeCost {
  name: string;
  instanceType: string;
  availabilityZone: string;
  rawNodePriceHourly: number;
  allocatedCostHourly: number;
  cpuAllocatableCores: number;
  cpuRequestedCores: number;
  cpuUsedCores: number;
  memoryAllocatableGiB: number;
  memoryRequestedGiB: number;
  memoryUsedGiB: number;
}

export interface WorkloadCost {
  namespace: string;
  workloadKind: string;
  workloadName: string;
  team: string;
  env: string;
  replicas: number;
  hourlyCost: number;
  cpuRequestedCores: number;
  cpuUsedCores: number;
  memoryRequestedGiB: number;
  memoryUsedGiB: number;
  nodes: string[];
}

export interface AgentInfo {
  name: string;
  baseUrl: string;
  status: string;
  lastScrapeTime: string;
  error?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  agents: AgentInfo[];
}

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`/api${path}`);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed with ${response.status}`);
  }
  return response.json();
}

export const fetchOverview = () => request<OverviewResponse>("/overview");
export const fetchNamespaces = () => request<NamespaceCost[]>("/namespaces");
export const fetchNodes = () => request<NodeCost[]>("/nodes");
export const fetchWorkloads = () => request<WorkloadCost[]>("/workloads");
export const fetchAgents = () => request<AgentInfo[]>("/agents");
export const fetchHealth = () => request<HealthResponse>("/health");
