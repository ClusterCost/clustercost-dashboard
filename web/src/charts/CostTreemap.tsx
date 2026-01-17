import { ResponsiveContainer, Treemap, Tooltip } from "recharts";
import { formatCurrency, formatPercentage } from "../lib/utils";
import { useMemo } from "react";

export interface TreemapNode {
    name: string;
    value: number; // Cost or Percentage
    size: number; // Used for "weight" if different from value
    formattedValue: string;
    originalData: any;
    children?: TreemapNode[];
}

interface CustomContentProps {
    depth: number;
    x: number;
    y: number;
    width: number;
    height: number;
    index: number;
    payload: any;
    colors: string[];
    rank: number;
    name: string;
    value: number;
}

const COLORS = [
    "#8884d8",
    "#83a6ed",
    "#8dd1e1",
    "#82ca9d",
    "#a4de6c",
    "#d0ed57",
    "#ffc658",
];

const CustomizeTreemapContent = (props: CustomContentProps) => {
    const { depth, x, y, width, height, name, value, colors, index } = props;

    return (
        <g>
            <rect
                x={x}
                y={y}
                width={width}
                height={height}
                style={{
                    fill: depth < 2 ? colors[Math.floor((index / colors.length) * colors.length) % colors.length] : "#ffffff00",
                    stroke: "#fff",
                    strokeWidth: 2 / (depth + 1e-10),
                    strokeOpacity: 1 / (depth + 1e-10),
                }}
            />
            {depth === 1 ? (
                <text
                    x={x + width / 2}
                    y={y + height / 2 + 7}
                    textAnchor="middle"
                    fill="#fff"
                    fontSize={14}
                >
                    {name}
                </text>
            ) : null}
            {depth === 1 ? (
                <text
                    x={x + 4}
                    y={y + 18}
                    fill="#fff"
                    fontSize={16}
                    fillOpacity={0.9}
                >
                    {index + 1}
                </text>
            ) : null}
        </g>
    );
};

const CustomTooltip = ({ active, payload, unit }: { active?: boolean; payload?: any[]; unit: "$" | "%" }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="rounded-lg border bg-background p-2 shadow-sm">
                <div className="font-semibold">{data.name}</div>
                <div className="text-sm text-muted-foreground">
                    {unit === "$" ? formatCurrency(data.value) : formatPercentage(data.value)}
                </div>
            </div>
        );
    }
    return null;
};

export const CostTreemap = ({ data, unit = "$" }: { data: TreemapNode[]; unit?: "$" | "%" }) => {

    // Recharts Treemap expects a single root node with children
    const treeData = useMemo(() => {
        return [{
            name: "Cluster",
            value: 0,
            children: data
        }];
    }, [data]);

    return (
        <ResponsiveContainer width="100%" height={400}>
            <Treemap
                data={treeData}
                dataKey="value"
                aspectRatio={4 / 3}
                stroke="#fff"
                fill="#8884d8"
                // @ts-ignore
                content={<CustomizeTreemapContent colors={COLORS} />}
            >
                <Tooltip content={<CustomTooltip unit={unit} />} />
            </Treemap>
        </ResponsiveContainer>
    );
};
