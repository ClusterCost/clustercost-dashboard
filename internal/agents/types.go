package agents

// HealthResponse represents the payload returned by the agent health endpoint.
type HealthResponse struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

// SummaryResponse represents aggregated cluster level information returned by an agent.
type SummaryResponse struct {
	Cluster ClusterOverview `json:"cluster"`
	Labels  []LabelEntry    `json:"labels"`
}

// ClusterOverview mirrors the cluster-level payload from the agent summary endpoint.
type ClusterOverview struct {
	ClusterName             string                    `json:"clusterName"`
	Provider                string                    `json:"provider"`
	Region                  string                    `json:"region"`
	HourlyCost              float64                   `json:"hourlyCost"`
	TotalCpuRequestMilli    float64                   `json:"totalCpuRequestMilli"`
	TotalMemoryRequestBytes float64                   `json:"totalMemoryRequestBytes"`
	PodCount                int                       `json:"podCount"`
	NodeCount               int                       `json:"nodeCount"`
	GeneratedAtUnix         int64                     `json:"generatedAtUnix"`
	CostByInstanceType      []ClusterInstanceTypeCost `json:"costByInstanceType"`
}

// LabelEntry represents a single label breakdown row (key/value pair + cost).
type LabelEntry struct {
	Key        string  `json:"key"`
	Value      string  `json:"value"`
	HourlyCost float64 `json:"hourlyCost"`
}

// TopNamespaceCost is a simplified view of high-volume namespaces.
type TopNamespaceCost struct {
	Namespace  string  `json:"namespace"`
	HourlyCost float64 `json:"hourlyCost"`
}

// LabelCost describes cost breakdowns for a specific label key.
type LabelCost struct {
	Value      string  `json:"value"`
	HourlyCost float64 `json:"hourlyCost"`
}

// ClusterInstanceTypeCost represents instance pricing data from the agent summary.
type ClusterInstanceTypeCost struct {
	InstanceType        string  `json:"instanceType"`
	NodeCount           int     `json:"nodeCount"`
	RawHourlyCost       float64 `json:"rawHourlyCost"`
	AllocatedHourlyCost float64 `json:"allocatedHourlyCost"`
}

// InstanceTypeCost shows aggregated cost per instance type in the dashboard API.
type InstanceTypeCost struct {
	InstanceType string  `json:"instanceType"`
	NodeCount    int     `json:"nodeCount"`
	HourlyCost   float64 `json:"hourlyCost"`
}

// NamespaceCost contains per-namespace allocation information.
type NamespaceCost struct {
	Namespace          string  `json:"namespace"`
	Team               string  `json:"team"`
	Env                string  `json:"env"`
	HourlyCost         float64 `json:"hourlyCost"`
	CPURequestedCores  float64 `json:"cpuRequestedCores"`
	CPUUsedCores       float64 `json:"cpuUsedCores"`
	MemoryRequestedGiB float64 `json:"memoryRequestedGiB"`
	MemoryUsedGiB      float64 `json:"memoryUsedGiB"`
	PodCount           int     `json:"podCount"`
}

// NodeCost represents node-level utilization and pricing.
type NodeCost struct {
	Name                 string  `json:"name"`
	InstanceType         string  `json:"instanceType"`
	AvailabilityZone     string  `json:"availabilityZone"`
	RawNodePriceHourly   float64 `json:"rawNodePriceHourly"`
	AllocatedCostHourly  float64 `json:"allocatedCostHourly"`
	CPUAllocatableCores  float64 `json:"cpuAllocatableCores"`
	CPURequestedCores    float64 `json:"cpuRequestedCores"`
	CPUUsedCores         float64 `json:"cpuUsedCores"`
	MemoryAllocatableGiB float64 `json:"memoryAllocatableGiB"`
	MemoryRequestedGiB   float64 `json:"memoryRequestedGiB"`
	MemoryUsedGiB        float64 `json:"memoryUsedGiB"`
}

// WorkloadCost aggregates costs per workload kind/name combination.
type WorkloadCost struct {
	Namespace          string   `json:"namespace"`
	WorkloadKind       string   `json:"workloadKind"`
	WorkloadName       string   `json:"workloadName"`
	Team               string   `json:"team"`
	Env                string   `json:"env"`
	Replicas           int      `json:"replicas"`
	HourlyCost         float64  `json:"hourlyCost"`
	CPURequestedCores  float64  `json:"cpuRequestedCores"`
	CPUUsedCores       float64  `json:"cpuUsedCores"`
	MemoryRequestedGiB float64  `json:"memoryRequestedGiB"`
	MemoryUsedGiB      float64  `json:"memoryUsedGiB"`
	Nodes              []string `json:"nodes"`
}

// PodCost contains per-pod level metrics for drill downs.
type PodCost struct {
	Namespace          string  `json:"namespace"`
	PodName            string  `json:"podName"`
	NodeName           string  `json:"nodeName"`
	HourlyCost         float64 `json:"hourlyCost"`
	CPURequestedCores  float64 `json:"cpuRequestedCores"`
	CPUUsedCores       float64 `json:"cpuUsedCores"`
	MemoryRequestedGiB float64 `json:"memoryRequestedGiB"`
	MemoryUsedGiB      float64 `json:"memoryUsedGiB"`
}
