import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { formatCurrency } from "../lib/utils";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";

export interface NamespaceCostDatum {
  name: string;
  value: number;
}

const chartConfig: ChartConfig = {
  value: {
    label: "Monthly cost",
    color: "hsl(var(--chart-2))"
  }
};

export const TopNamespacesBarChart = ({ data }: { data: NamespaceCostDatum[] }) => (
  <ChartContainer config={chartConfig} className="h-80 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 24, right: 16, top: 10, bottom: 10 }}>
        <XAxis type="number" tickFormatter={(value) => formatCurrency(value, { maximumFractionDigits: 0 })} hide />
        <YAxis type="category" dataKey="name" width={140} tick={{ fill: "#94a3b8", fontSize: 12 }} />
        <ChartTooltip cursor={false} content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} hideLabel />} />
        <Bar dataKey="value" fill={chartConfig.value?.color ?? "hsl(var(--chart-2))"} radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  </ChartContainer>
);
