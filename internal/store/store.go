package store

import (
	"errors"
	"sort"
	"sync"
	"time"

	"github.com/clustercost/clustercost-dashboard/internal/agents"
	"github.com/clustercost/clustercost-dashboard/internal/config"
)

// ErrNoData indicates that the store has not ingested any data yet.
var ErrNoData = errors.New("no data available")

// Store keeps the latest snapshots retrieved from agents.
type Store struct {
	mu           sync.RWMutex
	agentConfigs map[string]config.AgentConfig
	snapshots    map[string]*AgentSnapshot
}

// AgentSnapshot contains the most recent data fetched for an agent.
type AgentSnapshot struct {
	Health     *agents.HealthResponse
	Summary    *agents.SummaryResponse
	Namespaces []agents.NamespaceCost
	Nodes      []agents.NodeCost
	Workloads  []agents.WorkloadCost
	Pods       []agents.PodCost
	LastScrape time.Time
	LastError  string
}

// OverviewResponse matches the payload served by /api/overview.
type OverviewResponse struct {
	ClusterName             string                        `json:"clusterName"`
	Provider                string                        `json:"provider"`
	Region                  string                        `json:"region"`
	TotalHourlyCost         float64                       `json:"totalHourlyCost"`
	TotalCpuCores           float64                       `json:"totalCpuCores"`
	TotalCpuRequestedCores  float64                       `json:"totalCpuRequestedCores"`
	TotalMemoryGiB          float64                       `json:"totalMemoryGiB"`
	TotalMemoryRequestedGiB float64                       `json:"totalMemoryRequestedGiB"`
	TopNamespaces           []agents.TopNamespaceCost     `json:"topNamespaces"`
	CostByLabel             map[string][]agents.LabelCost `json:"costByLabel"`
	CostByInstanceType      []agents.InstanceTypeCost     `json:"costByInstanceType"`
}

// AgentInfo is exposed on /api/agents and /api/health.
type AgentInfo struct {
	Name           string    `json:"name"`
	BaseURL        string    `json:"baseUrl"`
	Status         string    `json:"status"`
	LastScrapeTime time.Time `json:"lastScrapeTime"`
	Error          string    `json:"error,omitempty"`
}

// New creates a store seeded with agent configurations.
func New(cfgs []config.AgentConfig) *Store {
	agentConfigs := make(map[string]config.AgentConfig, len(cfgs))
	for _, c := range cfgs {
		agentConfigs[c.Name] = c
	}
	return &Store{
		agentConfigs: agentConfigs,
		snapshots:    make(map[string]*AgentSnapshot, len(cfgs)),
	}
}

// Update stores the latest snapshot for a given agent.
func (s *Store) Update(name string, snapshot AgentSnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()
	copySnapshot := snapshot
	s.snapshots[name] = &copySnapshot
}

// Overview aggregates cluster level information.
func (s *Store) Overview() (OverviewResponse, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	aggregated := OverviewResponse{
		CostByLabel: make(map[string][]agents.LabelCost),
	}

	haveData := false
	labelTotals := map[string]map[string]float64{}
	instanceTotals := map[string]*agents.InstanceTypeCost{}
	namespaceTotals := map[string]*agents.TopNamespaceCost{}
	var totalCpuCapacity float64
	var totalMemoryCapacity float64

	for _, snap := range s.snapshots {
		if snap == nil {
			continue
		}
		for _, node := range snap.Nodes {
			totalCpuCapacity += node.CPUAllocatableCores
			totalMemoryCapacity += node.MemoryAllocatableGiB
		}
		for _, ns := range snap.Namespaces {
			entry := namespaceTotals[ns.Namespace]
			if entry == nil {
				namespaceTotals[ns.Namespace] = &agents.TopNamespaceCost{
					Namespace:  ns.Namespace,
					HourlyCost: ns.HourlyCost,
				}
				continue
			}
			entry.HourlyCost += ns.HourlyCost
		}
		summary := snap.Summary
		if summary == nil {
			continue
		}
		haveData = true
		cluster := summary.Cluster
		if aggregated.ClusterName == "" {
			aggregated.ClusterName = cluster.ClusterName
			aggregated.Provider = cluster.Provider
			aggregated.Region = cluster.Region
		}
		aggregated.TotalHourlyCost += cluster.HourlyCost
		aggregated.TotalCpuRequestedCores += cluster.TotalCpuRequestMilli / 1000
		aggregated.TotalMemoryRequestedGiB += cluster.TotalMemoryRequestBytes / (1024 * 1024 * 1024)

		for _, entry := range summary.Labels {
			lt := labelTotals[entry.Key]
			if lt == nil {
				lt = make(map[string]float64)
				labelTotals[entry.Key] = lt
			}
			lt[entry.Value] += entry.HourlyCost
		}

		for _, inst := range cluster.CostByInstanceType {
			dashboardInst := instanceTotals[inst.InstanceType]
			if dashboardInst == nil {
				instanceTotals[inst.InstanceType] = &agents.InstanceTypeCost{
					InstanceType: inst.InstanceType,
					NodeCount:    inst.NodeCount,
					HourlyCost:   inst.AllocatedHourlyCost,
				}
				continue
			}
			dashboardInst.NodeCount += inst.NodeCount
			dashboardInst.HourlyCost += inst.AllocatedHourlyCost
		}
	}

	if !haveData {
		return OverviewResponse{}, ErrNoData
	}

	aggregated.TotalCpuCores = totalCpuCapacity
	aggregated.TotalMemoryGiB = totalMemoryCapacity

	aggregated.TopNamespaces = make([]agents.TopNamespaceCost, 0, len(namespaceTotals))
	for _, ns := range namespaceTotals {
		aggregated.TopNamespaces = append(aggregated.TopNamespaces, *ns)
	}
	sort.SliceStable(aggregated.TopNamespaces, func(i, j int) bool {
		return aggregated.TopNamespaces[i].HourlyCost > aggregated.TopNamespaces[j].HourlyCost
	})
	if len(aggregated.TopNamespaces) > 5 {
		aggregated.TopNamespaces = aggregated.TopNamespaces[:5]
	}

	for label, totals := range labelTotals {
		pairs := make([]agents.LabelCost, 0, len(totals))
		for value, cost := range totals {
			pairs = append(pairs, agents.LabelCost{Value: value, HourlyCost: cost})
		}
		sort.SliceStable(pairs, func(i, j int) bool {
			return pairs[i].HourlyCost > pairs[j].HourlyCost
		})
		aggregated.CostByLabel[label] = pairs
	}

	aggregated.CostByInstanceType = make([]agents.InstanceTypeCost, 0, len(instanceTotals))
	for _, inst := range instanceTotals {
		aggregated.CostByInstanceType = append(aggregated.CostByInstanceType, *inst)
	}
	sort.SliceStable(aggregated.CostByInstanceType, func(i, j int) bool {
		return aggregated.CostByInstanceType[i].HourlyCost > aggregated.CostByInstanceType[j].HourlyCost
	})

	return aggregated, nil
}

// Namespaces aggregates namespace level information across agents.
func (s *Store) Namespaces() ([]agents.NamespaceCost, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	collector := map[string]agents.NamespaceCost{}
	for _, snap := range s.snapshots {
		if snap == nil {
			continue
		}
		for _, ns := range snap.Namespaces {
			key := ns.Namespace + "|" + ns.Team + "|" + ns.Env
			existing, ok := collector[key]
			if !ok {
				collector[key] = ns
				continue
			}
			existing.HourlyCost += ns.HourlyCost
			existing.CPURequestedCores += ns.CPURequestedCores
			existing.CPUUsedCores += ns.CPUUsedCores
			existing.MemoryRequestedGiB += ns.MemoryRequestedGiB
			existing.MemoryUsedGiB += ns.MemoryUsedGiB
			existing.PodCount += ns.PodCount
			collector[key] = existing
		}
	}

	if len(collector) == 0 {
		return nil, ErrNoData
	}

	out := make([]agents.NamespaceCost, 0, len(collector))
	for _, ns := range collector {
		out = append(out, ns)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].HourlyCost > out[j].HourlyCost
	})
	return out, nil
}

// Nodes returns the list of nodes observed across agents.
func (s *Store) Nodes() ([]agents.NodeCost, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	collector := map[string]agents.NodeCost{}
	for _, snap := range s.snapshots {
		if snap == nil {
			continue
		}
		for _, node := range snap.Nodes {
			existing, ok := collector[node.Name]
			if !ok {
				collector[node.Name] = node
				continue
			}
			existing.AllocatedCostHourly += node.AllocatedCostHourly
			collector[node.Name] = existing
		}
	}

	if len(collector) == 0 {
		return nil, ErrNoData
	}

	out := make([]agents.NodeCost, 0, len(collector))
	for _, node := range collector {
		out = append(out, node)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].AllocatedCostHourly > out[j].AllocatedCostHourly
	})
	return out, nil
}

// Workloads aggregates workloads across agents.
func (s *Store) Workloads() ([]agents.WorkloadCost, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	collector := map[string]agents.WorkloadCost{}
	for _, snap := range s.snapshots {
		if snap == nil {
			continue
		}
		for _, wl := range snap.Workloads {
			key := wl.Namespace + "|" + wl.WorkloadKind + "|" + wl.WorkloadName
			existing, ok := collector[key]
			if !ok {
				collector[key] = wl
				continue
			}
			existing.HourlyCost += wl.HourlyCost
			existing.CPURequestedCores += wl.CPURequestedCores
			existing.CPUUsedCores += wl.CPUUsedCores
			existing.MemoryRequestedGiB += wl.MemoryRequestedGiB
			existing.MemoryUsedGiB += wl.MemoryUsedGiB
			existing.Replicas += wl.Replicas
			existing.Nodes = append(existing.Nodes, wl.Nodes...)
			collector[key] = existing
		}
	}

	if len(collector) == 0 {
		return nil, ErrNoData
	}

	out := make([]agents.WorkloadCost, 0, len(collector))
	for _, wl := range collector {
		out = append(out, wl)
	}
	sort.SliceStable(out, func(i, j int) bool {
		return out[i].HourlyCost > out[j].HourlyCost
	})
	return out, nil
}

// Pods aggregates pods across all agents, optionally filtering by namespace when provided.
func (s *Store) Pods(namespace string) ([]agents.PodCost, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var out []agents.PodCost
	for _, snap := range s.snapshots {
		if snap == nil {
			continue
		}
		for _, pod := range snap.Pods {
			if namespace != "" && pod.Namespace != namespace {
				continue
			}
			out = append(out, pod)
		}
	}

	if len(out) == 0 {
		return nil, ErrNoData
	}

	sort.SliceStable(out, func(i, j int) bool {
		return out[i].HourlyCost > out[j].HourlyCost
	})
	return out, nil
}

// Agents returns metadata about configured agents and their latest status.
func (s *Store) Agents() []AgentInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]AgentInfo, 0, len(s.agentConfigs))
	for name, cfg := range s.agentConfigs {
		snapshot := s.snapshots[name]
		info := AgentInfo{
			Name:    name,
			BaseURL: cfg.BaseURL,
			Status:  "unknown",
		}
		if snapshot != nil {
			if snapshot.LastError != "" {
				info.Status = "error"
				info.Error = snapshot.LastError
			} else if snapshot.Health != nil {
				info.Status = snapshot.Health.Status
			} else {
				info.Status = "stale"
			}
			info.LastScrapeTime = snapshot.LastScrape
		}
		result = append(result, info)
	}
	sort.SliceStable(result, func(i, j int) bool {
		return result[i].Name < result[j].Name
	})
	return result
}
