import { useCallback, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  type Edge,
  type Node,
  type NodeProps
} from "reactflow";
import "reactflow/dist/style.css";

import { fetchNamespaces, fetchNetworkTopology, type NetworkEdge } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Box,
  Cloud,
  Database,
  Globe,
  Layers,
  Network,
  Repeat,
  Server,
  Circle
} from "lucide-react";

const lookbackOptions = [
  { label: "15m", value: "15m" },
  { label: "1h", value: "1h" },
  { label: "6h", value: "6h" },
  { label: "24h", value: "24h" }
];

const nodeSpacing = 220;
const groupPadding = 22;
const groupHeaderHeight = 36;
const defaultCostThreshold = 0.01;
const defaultMinBytesMb = 0;
const defaultMinConnections = 0;
const maxExternalEndpoints = 10;
const maxInfraEndpoints = 10;
const tierGap = 90;
const externalRowPadding = 40;

type ResourceKind =
  | "service"
  | "deployment"
  | "statefulset"
  | "daemonset"
  | "pod"
  | "node"
  | "ip"
  | "external"
  | "unknown";

type ResourceNodeData = {
  title: string;
  kind: ResourceKind;
  namespace: string;
};

type NamespaceNodeData = {
  name: string;
  count: number;
};

type AggregatedEdge = {
  srcId: string;
  dstId: string;
  bytesSent: number;
  bytesReceived: number;
  egressCostUsd: number;
  connectionCount: number;
  isExternal: boolean;
  isCrossAz: boolean;
  direction: "egress" | "ingress" | "internal";
};

const parseWorkloadFromPod = (podName: string) => {
  const parts = podName.split("-");
  const last = parts[parts.length - 1];
  const secondLast = parts[parts.length - 2] ?? "";

  if (parts.length >= 2 && /^\d+$/.test(last)) {
    return { name: parts.slice(0, -1).join("-"), kind: "statefulset" as const };
  }

  if (parts.length >= 3 && /^[a-z0-9]{5}$/.test(last) && /^[a-z0-9]{9,10}$/.test(secondLast)) {
    return { name: parts.slice(0, -2).join("-"), kind: "deployment" as const };
  }

  if (parts.length >= 2 && /^[a-z0-9]{5}$/.test(last)) {
    return { name: parts.slice(0, -1).join("-"), kind: "daemonset" as const };
  }

  return { name: podName, kind: "pod" as const };
};

const extractNamespaceFromServices = (services: string | null | undefined) => {
  if (!services) return "";
  const first = services.split(",")[0]?.trim();
  if (!first) return "";
  const [namespace] = first.split("/");
  return namespace ?? "";
};

const extractServiceName = (services: string | null | undefined) => {
  if (!services) return "";
  const first = services.split(",")[0]?.trim();
  if (!first) return "";
  const [_, name] = first.split("/");
  return name ?? "";
};

const getExternalKey = (edge: NetworkEdge) => {
  if (edge.dstKind !== "external") return "";
  return `external:${edge.dstDnsName || edge.dstIp || "unknown"}`;
};

const getInfraKey = (edge: NetworkEdge, side: "src" | "dst") => {
  const namespace = side === "src" ? edge.srcNamespace : edge.dstNamespace;
  const pod = side === "src" ? edge.srcPodName : edge.dstPodName;
  const node = side === "src" ? edge.srcNodeName : edge.dstNodeName;
  const ip = side === "src" ? edge.srcIp : edge.dstIp;

  if (namespace || pod) return "";
  if (node) return `infra:node:${node}`;
  if (ip) return `infra:ip:${ip}`;
  return "";
};

const buildEndpointGroup = (
  edge: NetworkEdge,
  side: "src" | "dst",
  topExternal: Set<string>,
  topInfra: Set<string>
) => {
  const namespace = side === "src" ? edge.srcNamespace : edge.dstNamespace;
  const pod = side === "src" ? edge.srcPodName : edge.dstPodName;
  const node = side === "src" ? edge.srcNodeName : edge.dstNodeName;
  const ip = side === "src" ? edge.srcIp : edge.dstIp;
  const dnsName = side === "src" ? edge.srcDnsName : edge.dstDnsName;
  const isExternal = side === "dst" && edge.dstKind === "external";
  const services = side === "dst" ? edge.dstServices : "";

  if (isExternal) {
    const externalKey = getExternalKey(edge);
    if (externalKey && !topExternal.has(externalKey)) {
      return {
        id: "external:other",
        title: "Other external IPs",
        kind: "external" as const,
        namespace: "external",
        isExternal: true
      };
    }
    return {
      id: externalKey || `external:${dnsName || ip || "unknown"}`,
      title: dnsName || ip || "External",
      kind: "external" as const,
      namespace: "external",
      isExternal: true
    };
  }

  const serviceName = !pod ? extractServiceName(services) : "";
  const serviceNamespace = !namespace && serviceName ? extractNamespaceFromServices(services) : namespace;

  if (serviceNamespace && serviceName) {
    return {
      id: `${side}:service:${serviceNamespace}/${serviceName}`,
      title: serviceName,
      kind: "service" as const,
      namespace: serviceNamespace,
      isExternal: false
    };
  }

  if (namespace && pod) {
    const workload = parseWorkloadFromPod(pod);
    return {
      id: `${side}:${workload.kind}:${namespace}/${workload.name}`,
      title: workload.name,
      kind: workload.kind,
      namespace,
      isExternal: false
    };
  }

  if (node) {
    const infraKey = getInfraKey(edge, side);
    if (infraKey && !topInfra.has(infraKey)) {
      return {
        id: "infra:other",
        title: "Other infra endpoints",
        kind: "node" as const,
        namespace: "infrastructure",
        isExternal: false
      };
    }
    return {
      id: `${side}:node:${node}`,
      title: node,
      kind: "node" as const,
      namespace: "infrastructure",
      isExternal: false
    };
  }

  if (ip) {
    const infraKey = getInfraKey(edge, side);
    if (infraKey && !topInfra.has(infraKey)) {
      return {
        id: "infra:other",
        title: "Other infra endpoints",
        kind: "ip" as const,
        namespace: "infrastructure",
        isExternal: false
      };
    }
    return {
      id: `${side}:ip:${dnsName || ip}`,
      title: dnsName || ip,
      kind: "ip" as const,
      namespace: "infrastructure",
      isExternal: false
    };
  }

  return {
    id: `${side}:unknown`,
    title: "Unknown",
    kind: "unknown" as const,
    namespace: "unknown",
    isExternal: false
  };
};

const edgeColor = (edge: AggregatedEdge) => {
  if (edge.direction === "egress" && edge.egressCostUsd > 0.01) return "#f97316";
  if (edge.isExternal && edge.direction === "ingress") return "#2563eb";
  if (edge.isExternal) return "#ef4444";
  if (edge.egressCostUsd < 0.01) return "rgba(148,163,184,0.45)";
  if (edge.isCrossAz) return "#f97316";
  return "#0ea5a4";
};

const edgeLabel = (edge: AggregatedEdge) => {
  if (!edge.egressCostUsd) return "$0.00";
  return `$${edge.egressCostUsd.toFixed(2)}`;
};

const edgeWidth = (edge: AggregatedEdge) => {
  if (edge.egressCostUsd <= 0.01 && edge.direction === "internal") return 1;
  const costWeight = Math.log10(edge.egressCostUsd + 1) * 2;
  return Math.min(8, Math.max(1.5, 2 + costWeight));
};

const isSystemNamespace = (value: string) => {
  if (!value) return false;
  const normalized = value.toLowerCase();
  return (
    normalized === "kube-system" ||
    normalized === "kube-public" ||
    normalized === "kube-node-lease" ||
    normalized === "elastic-system" ||
    normalized === "istio-system" ||
    normalized === "monitoring" ||
    normalized === "ingress-nginx" ||
    normalized === "cert-manager" ||
    normalized === "infrastructure"
  );
};

const kindMeta: Record<
  ResourceKind,
  { icon: typeof Box; color: string; bg: string; label: string }
> = {
  service: { icon: Network, color: "#0f766e", bg: "#ccfbf1", label: "Service" },
  deployment: { icon: Layers, color: "#7c3aed", bg: "#ede9fe", label: "Deployment" },
  statefulset: { icon: Database, color: "#b45309", bg: "#ffedd5", label: "StatefulSet" },
  daemonset: { icon: Repeat, color: "#1d4ed8", bg: "#dbeafe", label: "DaemonSet" },
  pod: { icon: Box, color: "#0f172a", bg: "#e2e8f0", label: "Pod" },
  node: { icon: Server, color: "#0f766e", bg: "#ccfbf1", label: "Node" },
  ip: { icon: Globe, color: "#0f172a", bg: "#e2e8f0", label: "IP" },
  external: { icon: Cloud, color: "#b91c1c", bg: "#fee2e2", label: "External" },
  unknown: { icon: Circle, color: "#475569", bg: "#e2e8f0", label: "Unknown" }
};

const ResourceNode = ({ data }: NodeProps<ResourceNodeData>) => {
  const meta = kindMeta[data.kind];
  const Icon = meta.icon;
  const sourcePosition = data.kind === "external" ? Position.Bottom : Position.Top;
  const targetPosition = Position.Bottom;

  return (
    <div
      style={{
        width: 190,
        padding: "10px 12px",
        borderRadius: 12,
        background: "#ffffff",
        border: `1px solid ${meta.color}40`,
        boxShadow: "0 12px 26px rgba(15, 23, 42, 0.12)",
        color: "#0f172a",
        wordBreak: "break-word"
      }}
    >
      <Handle type="target" position={targetPosition} style={{ background: meta.color }} />
      <div className="flex items-center gap-2">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full"
          style={{ background: meta.bg, color: meta.color }}
        >
          <Icon size={16} />
        </span>
        <div className="text-xs font-semibold uppercase tracking-wide" style={{ color: meta.color }}>
          {meta.label}
        </div>
      </div>
      <div className="mt-2 text-sm font-semibold leading-tight">{data.title}</div>
      <div className="text-xs text-muted-foreground">{data.namespace}</div>
      <Handle type="source" position={sourcePosition} style={{ background: meta.color }} />
    </div>
  );
};

const NamespaceNode = ({ data }: NodeProps<NamespaceNodeData>) => (
  <div
    style={{
      width: "100%",
      height: "100%",
      borderRadius: 18,
      border: "1px solid rgba(15, 23, 42, 0.12)",
      background: "linear-gradient(135deg, rgba(248,250,252,0.7), rgba(226,232,240,0.6))",
      boxShadow: "inset 0 0 0 1px rgba(148,163,184,0.2)",
      padding: groupPadding
    }}
  >
    <Handle type="target" position={Position.Bottom} style={{ opacity: 0 }} />
    <div className="flex items-center justify-between">
      <div className="text-sm font-semibold text-slate-800">{data.name}</div>
      <div className="rounded-full bg-slate-900/10 px-2 py-0.5 text-xs font-semibold text-slate-700">
        {data.count}
      </div>
    </div>
    <Handle type="source" position={Position.Top} style={{ opacity: 0 }} />
  </div>
);

const NetworkTopologyPage = () => {
  const [lookback, setLookback] = useState("1h");
  const [namespaces, setNamespaces] = useState<string[]>([]);
  const [namespaceCandidate, setNamespaceCandidate] = useState("");
  const [limit, setLimit] = useState(500);
  const [costThreshold, setCostThreshold] = useState(defaultCostThreshold);
  const [minBytesMb, setMinBytesMb] = useState(defaultMinBytesMb);
  const [minConnections, setMinConnections] = useState(defaultMinConnections);
  const nodeTypes = useMemo(() => ({ resource: ResourceNode, namespace: NamespaceNode }), []);

  const fetchTopology = useCallback(
    () =>
      fetchNetworkTopology({
        lookback,
        namespace: namespaces.length > 0 ? namespaces : undefined,
        limit: limit > 0 ? limit : undefined,
        minCost: costThreshold > 0 ? costThreshold : undefined,
        minBytes: minBytesMb > 0 ? Math.round(minBytesMb * 1024 * 1024) : undefined,
        minConnections: minConnections > 0 ? minConnections : undefined
      }),
    [lookback, namespaces, limit, costThreshold, minBytesMb, minConnections]
  );

  const { data, loading, error, refresh } = useApiData(fetchTopology);
  const { data: namespaceData } = useApiData(fetchNamespaces);

  const namespaceOptions = useMemo(() => {
    if (!namespaceData?.records) return [];
    return namespaceData.records
      .map((record) => record.namespace)
      .filter((name) => name)
      .sort((a, b) => a.localeCompare(b));
  }, [namespaceData]);

  const addNamespace = useCallback(() => {
    if (!namespaceCandidate) return;
    if (namespaces.includes(namespaceCandidate)) return;
    setNamespaces((prev) => [...prev, namespaceCandidate]);
    setNamespaceCandidate("");
  }, [namespaceCandidate, namespaces]);

  const removeNamespace = useCallback((value: string) => {
    setNamespaces((prev) => prev.filter((entry) => entry !== value));
  }, []);

  const { nodes, edges } = useMemo(() => {
    if (!data?.edges?.length) return { nodes: [], edges: [] };

    const nodeMap = new Map<string, Node<ResourceNodeData>>();
    const aggregatedEdges = new Map<string, AggregatedEdge>();

    const externalUsage = new Map<string, number>();
    const infraUsage = new Map<string, number>();

    data.edges.forEach((edge) => {
      const bytes = edge.bytesSent + edge.bytesReceived;
      const externalKey = getExternalKey(edge);
      if (externalKey) {
        externalUsage.set(externalKey, (externalUsage.get(externalKey) ?? 0) + bytes);
      }

      (["src", "dst"] as const).forEach((side) => {
        const infraKey = getInfraKey(edge, side);
        if (!infraKey) return;
        infraUsage.set(infraKey, (infraUsage.get(infraKey) ?? 0) + bytes);
      });
    });

    const topExternal = new Set(
      Array.from(externalUsage.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxExternalEndpoints)
        .map(([key]) => key)
    );
    const topInfra = new Set(
      Array.from(infraUsage.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, maxInfraEndpoints)
        .map(([key]) => key)
    );

    data.edges.forEach((edge) => {
      const srcGroup = buildEndpointGroup(edge, "src", topExternal, topInfra);
      const dstGroup = buildEndpointGroup(edge, "dst", topExternal, topInfra);

      if (!nodeMap.has(srcGroup.id)) {
        nodeMap.set(srcGroup.id, {
          id: srcGroup.id,
          data: { title: srcGroup.title, kind: srcGroup.kind, namespace: srcGroup.namespace },
          position: { x: 0, y: 0 },
          type: "resource"
        });
      }
      if (!nodeMap.has(dstGroup.id)) {
        nodeMap.set(dstGroup.id, {
          id: dstGroup.id,
          data: { title: dstGroup.title, kind: dstGroup.kind, namespace: dstGroup.namespace },
          position: { x: 0, y: 0 },
          type: "resource"
        });
      }

      const srcEdgeId =
        dstGroup.kind === "external" && srcGroup.namespace
          ? `namespace:${srcGroup.namespace}`
          : srcGroup.kind === "external" && dstGroup.namespace
          ? srcGroup.id
          : srcGroup.id;
      const dstEdgeId =
        srcGroup.kind === "external" && dstGroup.namespace
          ? `namespace:${dstGroup.namespace}`
          : dstGroup.id;

      const key = `${srcEdgeId}->${dstEdgeId}`;
      const isCrossAz =
        Boolean(edge.srcAvailabilityZone) &&
        Boolean(edge.dstAvailabilityZone) &&
        edge.srcAvailabilityZone !== edge.dstAvailabilityZone;
      const direction =
        srcGroup.kind === "external" ? "ingress" : dstGroup.kind === "external" ? "egress" : "internal";

      const existing = aggregatedEdges.get(key);
      if (existing) {
        existing.bytesSent += edge.bytesSent;
        existing.bytesReceived += edge.bytesReceived;
        existing.egressCostUsd += edge.egressCostUsd;
        existing.connectionCount += edge.connectionCount;
        existing.isCrossAz = existing.isCrossAz || isCrossAz;
        existing.isExternal = existing.isExternal || edge.dstKind === "external" || srcGroup.kind === "external";
        existing.direction = existing.direction === "internal" ? direction : existing.direction;
      } else {
        aggregatedEdges.set(key, {
          srcId: srcEdgeId,
          dstId: dstEdgeId,
          bytesSent: edge.bytesSent,
          bytesReceived: edge.bytesReceived,
          egressCostUsd: edge.egressCostUsd,
          connectionCount: edge.connectionCount,
          isExternal: edge.dstKind === "external" || srcGroup.kind === "external",
          isCrossAz,
          direction
        });
      }
    });

    const flowEdges: Edge[] = Array.from(aggregatedEdges.values()).map((edge) => ({
        id: `${edge.srcId}->${edge.dstId}`,
        source: edge.srcId,
        target: edge.dstId,
        type: "step",
        animated: edge.isExternal && edge.direction === "egress",
        label: edgeLabel(edge),
        style: {
          stroke: edgeColor(edge),
          strokeWidth: edgeWidth(edge),
          strokeDasharray: edge.egressCostUsd < 0.01 && edge.direction === "internal" ? "4 6" : undefined
        },
        labelStyle: {
          fill: "#0f172a",
          fontWeight: 600
        },
        labelBgPadding: [6, 4],
        labelBgBorderRadius: 6,
        labelBgStyle: { fill: "rgba(255,255,255,0.9)" }
      }));

    const activeNodeIds = new Set<string>();
    flowEdges.forEach((edge) => {
      activeNodeIds.add(edge.source);
      activeNodeIds.add(edge.target);
    });

    const namespaceMap = new Map<string, Node<ResourceNodeData>[]>();
    const externalNodes: Node<ResourceNodeData>[] = [];
    nodeMap.forEach((node) => {
      if (!activeNodeIds.has(node.id)) return;
      if (node.data.kind === "external") {
        externalNodes.push(node);
        return;
      }
      const ns = node.data.namespace || "unknown";
      if (!namespaceMap.has(ns)) namespaceMap.set(ns, []);
      namespaceMap.get(ns)?.push(node);
    });

    const namespaceList = Array.from(namespaceMap.keys()).sort((a, b) => a.localeCompare(b));
    const primaryNamespaces = namespaceList.filter((value) => !isSystemNamespace(value));
    const systemNamespaces = namespaceList.filter((value) => isSystemNamespace(value));
    const namespaceNodes: Node<NamespaceNodeData>[] = [];
    const childNodes: Node<ResourceNodeData>[] = [];
    const namespaceColumns = primaryNamespaces.length > 6 ? 3 : 2;
    const namespaceColumnWidth = 980;
    const namespaceGap = 40;
    const layoutNamespaces = (namespaces: string[], baseY: number) => {
      const localNamespaceNodes: Node<NamespaceNodeData>[] = [];
      const localRowHeights: number[] = [];

      namespaces.forEach((ns, index) => {
        const children = (namespaceMap.get(ns) ?? []).sort((a, b) => {
          if (a.data.kind !== b.data.kind) return a.data.kind.localeCompare(b.data.kind);
          return a.data.title.localeCompare(b.data.title);
        });

        const childColumns = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(children.length || 1))));
        const childRows = Math.max(1, Math.ceil(children.length / childColumns));
        const groupWidth = Math.max(420, childColumns * nodeSpacing + groupPadding * 2);
        const groupHeight = childRows * nodeSpacing + groupPadding * 2 + groupHeaderHeight;

        const col = index % namespaceColumns;
        const row = Math.floor(index / namespaceColumns);
        localRowHeights[row] = Math.max(localRowHeights[row] ?? 0, groupHeight);

        localNamespaceNodes.push({
          id: `namespace:${ns}`,
          type: "namespace",
          data: { name: ns, count: children.length },
          position: { x: 0, y: 0 },
          style: { width: groupWidth, height: groupHeight, zIndex: 0, pointerEvents: "none" },
          sourcePosition: Position.Top,
          targetPosition: Position.Bottom,
          selectable: false,
          draggable: false
        });

        children.forEach((node, idx) => {
          const rowIndex = Math.floor(idx / childColumns);
          const colIndex = idx % childColumns;
          node.parentNode = `namespace:${ns}`;
          node.extent = "parent";
          node.position = {
            x: groupPadding + colIndex * nodeSpacing,
            y: groupPadding + groupHeaderHeight + rowIndex * nodeSpacing
          };
          node.style = { ...(node.style ?? {}), zIndex: 2 };
          node.sourcePosition = Position.Top;
          node.targetPosition = Position.Bottom;
          childNodes.push(node);
        });
      });

      const rowOffsets: number[] = [];
      localRowHeights.forEach((height, idx) => {
        rowOffsets[idx] = (rowOffsets[idx - 1] ?? 0) + (idx === 0 ? 0 : localRowHeights[idx - 1] + namespaceGap);
      });

      localNamespaceNodes.forEach((node, index) => {
        const col = index % namespaceColumns;
        const row = Math.floor(index / namespaceColumns);
        node.position = {
          x: col * (namespaceColumnWidth + namespaceGap),
          y: baseY + (rowOffsets[row] ?? 0)
        };
      });

      namespaceNodes.push(...localNamespaceNodes);
      const totalHeight =
        localRowHeights.length === 0
          ? 0
          : localRowHeights.reduce((sum, height) => sum + height, 0) +
            namespaceGap * (localRowHeights.length - 1);
      return totalHeight;
    };

    const externalRowColumns = Math.min(6, Math.max(2, externalNodes.length));
    const externalRowHeight =
      externalNodes.length === 0
        ? 0
        : Math.ceil(externalNodes.length / externalRowColumns) * nodeSpacing + externalRowPadding * 2;

    externalNodes.forEach((node, index) => {
      const col = index % externalRowColumns;
      const row = Math.floor(index / externalRowColumns);
      node.position = {
        x: col * (nodeSpacing + 40),
        y: externalRowPadding + row * nodeSpacing
      };
      node.targetPosition = Position.Bottom;
      node.sourcePosition = Position.Bottom;
    });

    const middleStartY = externalRowHeight + tierGap;
    const middleHeight = layoutNamespaces(primaryNamespaces, middleStartY);

    const systemStartY = middleStartY + Math.max(0, middleHeight) + tierGap;
    layoutNamespaces(systemNamespaces, systemStartY);

    return { nodes: [...externalNodes, ...namespaceNodes, ...childNodes], edges: flowEdges };
  }, [data]);

  const totalCost = useMemo(() => {
    if (!data?.edges) return 0;
    return data.edges.reduce((sum, edge) => sum + edge.egressCostUsd, 0);
  }, [data]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Cost-Aware Network Topology</h1>
          <p className="text-sm text-muted-foreground">
            Highlight cross-AZ and internet egress connections with real cost impact.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-36">
            <Select value={lookback} onValueChange={setLookback}>
              <SelectTrigger>
                <SelectValue placeholder="Lookback" />
              </SelectTrigger>
              <SelectContent>
                {lookbackOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className="w-52">
                <Select value={namespaceCandidate} onValueChange={setNamespaceCandidate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Add namespace" />
                  </SelectTrigger>
                  <SelectContent>
                    {namespaceOptions.map((name) => (
                      <SelectItem key={name} value={name} disabled={namespaces.includes(name)}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={addNamespace}
                disabled={!namespaceCandidate || namespaces.includes(namespaceCandidate)}
              >
                Add
              </Button>
              <Button variant="outline" size="sm" onClick={() => setNamespaces([])} disabled={namespaces.length === 0}>
                All
              </Button>
            </div>
            {namespaces.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {namespaces.map((name) => (
                  <Badge key={name} variant="secondary" className="gap-1">
                    <span>{name}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-4 w-4 rounded-full"
                      onClick={() => removeNamespace(name)}
                      aria-label={`Remove ${name}`}
                    >
                      ×
                    </Button>
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">All namespaces</p>
            )}
          </div>
          <Input
            value={String(limit)}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              setLimit(Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0);
            }}
            placeholder="Max edges"
            className="w-28"
            inputMode="numeric"
          />
          <Input
            value={costThreshold.toString()}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              setCostThreshold(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
            }}
            placeholder="Min cost $"
            className="w-28"
            inputMode="decimal"
          />
          <Input
            value={minBytesMb.toString()}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              setMinBytesMb(Number.isFinite(parsed) ? Math.max(0, parsed) : 0);
            }}
            placeholder="Min MB"
            className="w-24"
            inputMode="decimal"
          />
          <Input
            value={minConnections.toString()}
            onChange={(event) => {
              const parsed = Number(event.target.value);
              setMinConnections(Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0);
            }}
            placeholder="Min conns"
            className="w-24"
            inputMode="numeric"
          />
          <Button onClick={refresh}>Refresh</Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Edges</p>
          <p className="text-2xl font-semibold">{data?.totalEdges ?? 0}</p>
          <p className="text-xs text-muted-foreground">
            Aggregated {edges.length} • Limit {data?.requestedLimit ?? limit}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Estimated Egress Cost</p>
          <p className="text-2xl font-semibold">${totalCost.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Across current window</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Legend</p>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <span className="h-2 w-6 rounded-full bg-[#0ea5a4]" />
              <span>Intra-AZ / Internal</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-6 rounded-full bg-[#f97316]" />
              <span>Cross-AZ</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-6 rounded-full bg-[#ef4444]" />
              <span>Internet Egress</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="h-2 w-6 rounded-full bg-[#2563eb]" />
              <span>Internet Ingress</span>
            </div>
          </div>
        </Card>
      </div>

      <Card className="h-[640px] overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center">
            <Skeleton className="h-[520px] w-[90%]" />
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
            <p>Failed to load topology.</p>
            <Button variant="outline" onClick={refresh}>
              Retry
            </Button>
          </div>
        ) : nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No network connections found for this window.
          </div>
        ) : (
          <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView>
            <Background gap={18} size={1} color="#e2e8f0" />
            <MiniMap zoomable pannable />
            <Controls />
          </ReactFlow>
        )}
      </Card>
    </div>
  );
};

export default NetworkTopologyPage;
