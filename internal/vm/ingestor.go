package vm

import (
	"bytes"
	"compress/gzip"
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"path"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/clustercost/clustercost-dashboard/internal/config"
	"github.com/clustercost/clustercost-dashboard/internal/store"
	agentv1 "github.com/clustercost/clustercost-dashboard/internal/proto/agent/v1"
)

const (
	defaultIngestPath     = "/api/v1/import/prometheus"
	defaultTimeout        = 5 * time.Second
	defaultFlushInterval  = 2 * time.Second
	defaultBatchBytes     = 2 << 20 // 2 MiB
	defaultQueueSize      = 10000
	defaultWorkerOverride = 0
)

// Ingestor batches gRPC reports into VictoriaMetrics.
type Ingestor struct {
	ingestURL     string
	authToken     string
	username      string
	password      string
	enableGzip    bool
	maxBatchBytes int
	flushInterval time.Duration
	queue         chan reportEnvelope
	client        *http.Client
	logger        *log.Logger
	agentMeta     map[string]agentMetadata
	stopped       atomic.Bool
	wg            sync.WaitGroup
}

type reportEnvelope struct {
	agentName string
	req       *agentv1.ReportRequest
}

type agentMetadata struct {
	clusterType   string
	clusterRegion string
}

// NewIngestor creates a VictoriaMetrics ingestor. If no URL is configured, it returns nil.
func NewIngestor(cfg config.Config, logger *log.Logger) (*Ingestor, error) {
	if cfg.VictoriaMetricsURL == "" {
		return nil, nil
	}

	ingestURL, err := buildIngestURL(cfg.VictoriaMetricsURL, cfg.VictoriaMetricsIngestPath)
	if err != nil {
		return nil, err
	}

	timeout := cfg.VictoriaMetricsTimeout
	if timeout <= 0 {
		timeout = defaultTimeout
	}

	flushInterval := cfg.VictoriaMetricsFlushInterval
	if flushInterval <= 0 {
		flushInterval = defaultFlushInterval
	}

	batchBytes := cfg.VictoriaMetricsBatchBytes
	if batchBytes <= 0 {
		batchBytes = defaultBatchBytes
	}

	queueSize := cfg.VictoriaMetricsQueueSize
	if queueSize <= 0 {
		queueSize = defaultQueueSize
	}

	workers := cfg.VictoriaMetricsWorkers
	if workers <= 0 {
		if defaultWorkerOverride > 0 {
			workers = defaultWorkerOverride
		} else {
			workers = max(2, runtime.NumCPU())
		}
	}

	transport := &http.Transport{
		MaxIdleConns:        100,
		MaxIdleConnsPerHost: 100,
		IdleConnTimeout:     90 * time.Second,
	}

	ing := &Ingestor{
		ingestURL:     ingestURL,
		authToken:     cfg.VictoriaMetricsToken,
		username:      cfg.VictoriaMetricsUsername,
		password:      cfg.VictoriaMetricsPassword,
		enableGzip:    cfg.VictoriaMetricsGzip,
		maxBatchBytes: batchBytes,
		flushInterval: flushInterval,
		queue:         make(chan reportEnvelope, queueSize),
		client:        &http.Client{Timeout: timeout, Transport: transport},
		logger:        logger,
		agentMeta:     buildAgentMeta(cfg),
	}

	for i := 0; i < workers; i++ {
		ing.wg.Add(1)
		go ing.runWorker(i)
	}

	return ing, nil
}

// Enqueue queues a report for ingestion. It drops when the queue is full or stopped.
func (i *Ingestor) Enqueue(agentName string, req *agentv1.ReportRequest) bool {
	if i == nil || req == nil || i.stopped.Load() {
		return false
	}

	select {
	case i.queue <- reportEnvelope{agentName: agentName, req: req}:
		return true
	default:
		if i.logger != nil {
			i.logger.Printf("victoria metrics queue full; dropping report for agent %s", agentName)
		}
		return false
	}
}

// Stop flushes outstanding data and stops background workers.
func (i *Ingestor) Stop() {
	if i == nil {
		return
	}
	if i.stopped.Swap(true) {
		return
	}
	close(i.queue)
	i.wg.Wait()
}

func (i *Ingestor) runWorker(id int) {
	defer i.wg.Done()
	ticker := time.NewTicker(i.flushInterval)
	defer ticker.Stop()

	var buf bytes.Buffer
	flush := func() {
		if buf.Len() == 0 {
			return
		}
		if err := i.post(buf.Bytes()); err != nil && i.logger != nil {
			i.logger.Printf("victoria metrics ingest error: %v", err)
		}
		buf.Reset()
	}

	for {
		select {
		case env, ok := <-i.queue:
			if !ok {
				flush()
				return
			}
			i.appendReport(&buf, env)
			if buf.Len() >= i.maxBatchBytes {
				flush()
			}
		case <-ticker.C:
			flush()
		}
	}
}

func (i *Ingestor) post(payload []byte) error {
	var body io.Reader = bytes.NewReader(payload)
	var gz *gzip.Writer
	req, err := http.NewRequest(http.MethodPost, i.ingestURL, nil)
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}

	if i.enableGzip {
		var buf bytes.Buffer
		gz = gzip.NewWriter(&buf)
		if _, err := gz.Write(payload); err != nil {
			return fmt.Errorf("compress payload: %w", err)
		}
		if err := gz.Close(); err != nil {
			return fmt.Errorf("finalize payload: %w", err)
		}
		body = &buf
		req.Header.Set("Content-Encoding", "gzip")
	}

	req.Body = io.NopCloser(body)
	req.Header.Set("Content-Type", "text/plain; version=0.0.4")

	if i.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+i.authToken)
	} else if i.username != "" || i.password != "" {
		req.SetBasicAuth(i.username, i.password)
	}

	resp, err := i.client.Do(req)
	if err != nil {
		return fmt.Errorf("send payload: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("victoria metrics responded with status %d", resp.StatusCode)
	}
	return nil
}

func (i *Ingestor) appendReport(buf *bytes.Buffer, env reportEnvelope) {
	req := env.req
	if req == nil {
		return
	}

	tsMillis := reportTimestampMillis(req)
	agentName := env.agentName
	if agentName == "" {
		agentName = env.req.AgentId
	}
	// Fallback
	if agentName == "" {
		agentName = "unknown"
	}

	meta := i.agentMeta[agentName]
	base := baseLabels(agentName, env.req.ClusterId, "", meta) // ClusterName is not in V2 proto?
	// Wait, user proto: cluster_id = 2. No cluster_name.
	// We'll leave clusterName empty or rely on agentMeta?
	// The proto provided has: agent_id, cluster_id, node_name, availability_zone, timestamp_seconds, pods.
	// No cluster_name.

	// Report agent up
	writeSample(buf, "clustercost_agent_up", base, "1", tsMillis)

	// 2. Process Pods & Aggregate Namespace Data
	type nsAgg struct {
		hourlyCost      float64
		podCount        int64
		cpuUsageMilli   int64
		memoryRssBytes  int64
		cpuReqMilli     int64
		memReqBytes     int64
	}
	// map[namespace]*nsAgg
	nsMap := make(map[string]*nsAgg)
	pricing := store.NewPricingCatalog(nil)
	region := req.Region
	if region == "" {
		region = req.AvailabilityZone
	}
	if region == "" {
		region = "us-east-1"
	}
	instanceType := req.InstanceType
	if instanceType == "" {
		instanceType = "default"
	}
	vcpus := int64(0)
	ramBytes := int64(0)
	if req.NodeName != "" {
		for _, node := range req.Nodes {
			if node == nil || node.NodeName != req.NodeName {
				continue
			}
			if node.CapacityCpuMillicores > 0 {
				vcpus = int64(node.CapacityCpuMillicores / 1000)
			} else if node.AllocatableCpuMillicores > 0 {
				vcpus = int64(node.AllocatableCpuMillicores / 1000)
			}
			if node.CapacityMemoryBytes > 0 {
				ramBytes = int64(node.CapacityMemoryBytes)
			} else if node.AllocatableMemoryBytes > 0 {
				ramBytes = int64(node.AllocatableMemoryBytes)
			}
			break
		}
	}
	cpuPrice, memPrice := pricing.GetNodeResourcePrices(context.Background(), region, instanceType, vcpus, ramBytes)

	for _, pod := range req.Pods {
		if pod == nil {
			continue
		}

		// Labels are removed in V2 proto provided by user.
		// We can't determine environment or owners from labels anymore.
		// We will set environment to "unknown" or "production" default?
		environment := "production" // Default assumption without labels

		nodeName := req.NodeName

		region := req.Region
		if region == "" {
			region = req.AvailabilityZone
		}

		podLabels := appendLabels(base,
			label{"namespace", pod.Namespace},
			label{"pod", pod.PodName},
			label{"node", nodeName},
			label{"availability_zone", req.AvailabilityZone},
			label{"region", region},
			label{"instance_type", req.InstanceType},
			label{"environment", environment},
		)

		// Calculate Totals and Costs
		// CPU
		cpuUsageMilli := int64(0)
		cpuReq := int64(0)
		cpuLim := int64(0)
		if pod.Cpu != nil {
			cpuUsageMilli = int64(pod.Cpu.UsageMillicores)
			cpuReq = int64(pod.Cpu.RequestMillicores)
			cpuLim = int64(pod.Cpu.LimitMillicores)
		}

		// Memory
		memBytes := int64(0)
		memReq := int64(0)
		memLim := int64(0)
		if pod.Memory != nil {
			memBytes = int64(pod.Memory.RssBytes)
			memReq = int64(pod.Memory.RequestBytes)
			memLim = int64(pod.Memory.LimitBytes)
		}

		// Network
		netTx := int64(0)
		netRx := int64(0)
		egressPublic := int64(0)
		if pod.Network != nil {
			netTx = int64(pod.Network.BytesSent)
			netRx = int64(pod.Network.BytesReceived)
			egressPublic = int64(pod.Network.EgressPublicBytes)
		}

		writeSample(buf, "clustercost_pod_cpu_usage_milli", podLabels, formatInt(cpuUsageMilli), tsMillis)
		writeSample(buf, "clustercost_pod_cpu_request_millicores", podLabels, formatInt(cpuReq), tsMillis)
		writeSample(buf, "clustercost_pod_cpu_limit_millicores", podLabels, formatInt(cpuLim), tsMillis)

		writeSample(buf, "clustercost_pod_memory_rss_bytes", podLabels, formatInt(memBytes), tsMillis)
		writeSample(buf, "clustercost_pod_memory_request_bytes", podLabels, formatInt(memReq), tsMillis)
		writeSample(buf, "clustercost_pod_memory_limit_bytes", podLabels, formatInt(memLim), tsMillis)

		writeSample(buf, "clustercost_pod_network_tx_bytes_total", podLabels, formatInt(netTx), tsMillis)
		writeSample(buf, "clustercost_pod_network_rx_bytes_total", podLabels, formatInt(netRx), tsMillis)
		writeSample(buf, "clustercost_pod_network_egress_public_bytes_total", podLabels, formatInt(egressPublic), tsMillis)

		cpuReqCores := float64(cpuReq) / 1000.0
		memReqGB := float64(memReq) / (1024 * 1024 * 1024)
		hourlyCost := (cpuReqCores * cpuPrice) + (memReqGB * memPrice)
		writeSample(buf, "clustercost_pod_hourly_cost", podLabels, formatFloat(hourlyCost), tsMillis)

		// Aggregate for Namespace
		if nsMap[pod.Namespace] == nil {
			nsMap[pod.Namespace] = &nsAgg{}
		}
		agg := nsMap[pod.Namespace]
		agg.podCount++
		agg.cpuUsageMilli += cpuUsageMilli
		agg.memoryRssBytes += memBytes
		agg.hourlyCost += hourlyCost
		agg.cpuReqMilli += cpuReq
		agg.memReqBytes += memReq
	}

	// 3. Emit Aggregated Namespace Metrics
	for ns, agg := range nsMap {
		nsLabels := appendLabels(base,
			label{"namespace", ns},
			label{"environment", "production"},
		)
		writeSample(buf, "clustercost_namespace_pod_count", nsLabels, formatInt(agg.podCount), tsMillis)
		writeSample(buf, "clustercost_namespace_cpu_usage_milli", nsLabels, formatInt(agg.cpuUsageMilli), tsMillis)
		writeSample(buf, "clustercost_namespace_memory_rss_bytes_total", nsLabels, formatInt(agg.memoryRssBytes), tsMillis)
		writeSample(buf, "clustercost_namespace_hourly_cost", nsLabels, formatFloat(agg.hourlyCost), tsMillis)
		writeSample(buf, "clustercost_namespace_cpu_request_millicores", nsLabels, formatInt(agg.cpuReqMilli), tsMillis)
		writeSample(buf, "clustercost_namespace_memory_request_bytes", nsLabels, formatInt(agg.memReqBytes), tsMillis)
	}

	// 3b. Emit Node Metrics
	for _, node := range req.Nodes {
		if node == nil || node.NodeName == "" {
			continue
		}
		nodeLabels := appendLabels(base, label{"node", node.NodeName})
		if node.NodeName == req.NodeName && req.InstanceType != "" {
			nodeLabels = appendLabels(nodeLabels, label{"instance_type", req.InstanceType})
		}

		writeSample(buf, "clustercost_node_cpu_usage_milli", nodeLabels, formatUint(node.CpuUsageMillicores), tsMillis)
		writeSample(buf, "clustercost_node_memory_usage_bytes", nodeLabels, formatUint(node.MemoryUsageBytes), tsMillis)
		writeSample(buf, "clustercost_node_cpu_capacity_milli", nodeLabels, formatUint(node.CapacityCpuMillicores), tsMillis)
		writeSample(buf, "clustercost_node_memory_capacity_bytes", nodeLabels, formatUint(node.CapacityMemoryBytes), tsMillis)
		writeSample(buf, "clustercost_node_cpu_allocatable_milli", nodeLabels, formatUint(node.AllocatableCpuMillicores), tsMillis)
		writeSample(buf, "clustercost_node_memory_allocatable_bytes", nodeLabels, formatUint(node.AllocatableMemoryBytes), tsMillis)
		writeSample(buf, "clustercost_node_cpu_requested_milli", nodeLabels, formatUint(node.RequestedCpuMillicores), tsMillis)
		writeSample(buf, "clustercost_node_memory_requested_bytes", nodeLabels, formatUint(node.RequestedMemoryBytes), tsMillis)
		writeSample(buf, "clustercost_node_cpu_throttling_ns_total", nodeLabels, formatUint(node.ThrottlingNs), tsMillis)

		if node.AllocatableCpuMillicores > 0 {
			cpuPct := (float64(node.CpuUsageMillicores) / float64(node.AllocatableCpuMillicores)) * 100
			writeSample(buf, "clustercost_node_cpu_usage_percent", nodeLabels, formatFloat(cpuPct), tsMillis)
		}
		if node.AllocatableMemoryBytes > 0 {
			memPct := (float64(node.MemoryUsageBytes) / float64(node.AllocatableMemoryBytes)) * 100
			writeSample(buf, "clustercost_node_memory_usage_percent", nodeLabels, formatFloat(memPct), tsMillis)
		}
	}

	// 4. Emit Connection-Level Network Metrics
	var totalTx uint64
	var totalRx uint64
	for _, conn := range req.Connections {
		if conn == nil {
			continue
		}

		labels := connectionLabels(base, conn)
		writeSample(buf, "clustercost_connection_bytes_sent_total", labels, formatUint(conn.BytesSent), tsMillis)
		writeSample(buf, "clustercost_connection_bytes_received_total", labels, formatUint(conn.BytesReceived), tsMillis)

		totalTx += conn.BytesSent
		totalRx += conn.BytesReceived
	}

	if totalTx > 0 || totalRx > 0 {
		writeSample(buf, "clustercost_cluster_network_tx_bytes_total", base, formatUint(totalTx), tsMillis)
		writeSample(buf, "clustercost_cluster_network_rx_bytes_total", base, formatUint(totalRx), tsMillis)
	}
}

func buildIngestURL(baseURL, ingestPath string) (string, error) {
	parsed, err := url.Parse(baseURL)
	if err != nil {
		return "", fmt.Errorf("invalid victoria metrics url: %w", err)
	}
	if parsed.Scheme == "" {
		return "", fmt.Errorf("victoria metrics url missing scheme: %s", baseURL)
	}
	if ingestPath == "" {
		ingestPath = defaultIngestPath
	}
	parsed.Path = path.Join(parsed.Path, ingestPath)
	return parsed.String(), nil
}

func buildAgentMeta(cfg config.Config) map[string]agentMetadata {
	out := make(map[string]agentMetadata, len(cfg.Agents))
	for _, agent := range cfg.Agents {
		out[agent.Name] = agentMetadata{
			clusterType:   agent.Type,
			clusterRegion: agent.Region,
		}
	}
	return out
}

type label struct {
	key   string
	value string
}

func baseLabels(agentName, clusterID, clusterName string, meta agentMetadata) []label {
	labels := make([]label, 0, 5)
	if clusterID != "" {
		labels = append(labels, label{"cluster_id", clusterID})
	}
	if clusterName != "" {
		labels = append(labels, label{"cluster_name", clusterName})
	}
	if meta.clusterType != "" {
		labels = append(labels, label{"cluster_type", meta.clusterType})
	}
	if meta.clusterRegion != "" {
		labels = append(labels, label{"cluster_region", meta.clusterRegion})
	}
	if agentName != "" {
		labels = append(labels, label{"agent_id", agentName})
	}
	return labels
}

func appendLabels(base []label, extra ...label) []label {
	if len(extra) == 0 {
		return base
	}
	labels := make([]label, 0, len(base)+len(extra))
	labels = append(labels, base...)
	for _, item := range extra {
		if strings.TrimSpace(item.value) == "" {
			continue
		}
		labels = append(labels, item)
	}
	return labels
}

func writeSample(buf *bytes.Buffer, name string, labels []label, value string, tsMillis int64) {
	if name == "" || value == "" {
		return
	}
	buf.WriteString(name)
	if len(labels) > 0 {
		buf.WriteByte('{')
		for idx, item := range labels {
			if idx > 0 {
				buf.WriteByte(',')
			}
			buf.WriteString(item.key)
			buf.WriteString(`="`)
			buf.WriteString(escapeLabelValue(item.value))
			buf.WriteByte('"')
		}
		buf.WriteByte('}')
	}
	buf.WriteByte(' ')
	buf.WriteString(value)
	buf.WriteByte(' ')
	buf.WriteString(strconv.FormatInt(tsMillis, 10))
	buf.WriteByte('\n')
}

func formatFloat(value float64) string {
	return strconv.FormatFloat(value, 'f', -1, 64)
}

func formatInt(value int64) string {
	return strconv.FormatInt(value, 10)
}

func formatUint(value uint64) string {
	return strconv.FormatUint(value, 10)
}

func formatBool(value bool) string {
	if value {
		return "1"
	}
	return "0"
}

func reportTimestampMillis(req *agentv1.ReportRequest) int64 {
	if req != nil && req.TimestampSeconds > 0 {
		return req.TimestampSeconds * 1000
	}
	return time.Now().UnixMilli()
}

func connectionLabels(base []label, conn *agentv1.NetworkConnection) []label {
	if conn == nil {
		return base
	}

	labels := appendLabels(base,
		label{"protocol", strconv.FormatUint(uint64(conn.Protocol), 10)},
		label{"egress_class", conn.EgressClass},
		label{"dst_kind", conn.DstKind},
		label{"service_match", conn.ServiceMatch},
		label{"is_egress", strconv.FormatBool(conn.IsEgress)},
	)

	if conn.Src != nil {
		labels = appendLabels(labels, endpointLabels("src", conn.Src)...)
	}
	if conn.Dst != nil {
		labels = appendLabels(labels, endpointLabels("dst", conn.Dst)...)
		services := joinServiceRefs(conn.Dst.Services)
		if services != "" {
			labels = appendLabels(labels, label{"dst_services", services})
		}
	}
	return labels
}

func endpointLabels(prefix string, ep *agentv1.NetworkEndpoint) []label {
	if ep == nil {
		return nil
	}
	return []label{
		{prefix + "_ip", ep.Ip},
		{prefix + "_namespace", ep.Namespace},
		{prefix + "_pod", ep.PodName},
		{prefix + "_node", ep.NodeName},
		{prefix + "_availability_zone", ep.AvailabilityZone},
		{prefix + "_dns_name", ep.DnsName},
	}
}

func joinServiceRefs(services []*agentv1.ServiceRef) string {
	if len(services) == 0 {
		return ""
	}
	parts := make([]string, 0, len(services))
	for _, svc := range services {
		if svc == nil {
			continue
		}
		if svc.Namespace == "" && svc.Name == "" {
			continue
		}
		if svc.Namespace == "" {
			parts = append(parts, svc.Name)
			continue
		}
		parts = append(parts, svc.Namespace+"/"+svc.Name)
	}
	sort.Strings(parts)
	return strings.Join(parts, ",")
}

func max(a, b int) int {
	if a > b {
		return a
	}
	return b
}
