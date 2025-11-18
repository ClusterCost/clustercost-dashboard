import { Label, Legend, Pie, PieChart, Cell, ResponsiveContainer } from "recharts";
import { formatCurrency, type Environment } from "../lib/utils";
import {
  ChartContainer,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig
} from "@/components/ui/chart";

export interface EnvironmentChartDatum {
  environment: Environment | "non-prod" | "unknown";
  value: number;
}

const chartConfig: ChartConfig = {
  production: { label: "Production", color: "hsl(var(--chart-1))" },
  "non-prod": { label: "Non-Prod", color: "hsl(var(--chart-2))" },
  preprod: { label: "Preprod", color: "hsl(var(--chart-3))" },
  development: { label: "Development", color: "hsl(var(--chart-4))" },
  system: { label: "System", color: "hsl(var(--chart-5))" },
  unknown: { label: "Unknown", color: "hsl(var(--muted))" }
};

export const CostByEnvironmentChart = ({ data }: { data: EnvironmentChartDatum[] }) => {
  const total = data.reduce((sum, entry) => sum + entry.value, 0);

  if (total === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No spend data yet.
      </div>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[320px] w-full justify-center">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel formatter={(value) => formatCurrency(Number(value))} />} />
          <Pie
            data={data}
            dataKey="value"
            nameKey="environment"
            innerRadius={70}
            outerRadius={110}
            strokeWidth={5}
            paddingAngle={4}
          >
            {data.map((entry) => (
              <Cell key={entry.environment} fill={chartConfig[entry.environment]?.color ?? "hsl(var(--border))"} />
            ))}
            <Label
              content={({ viewBox }) => {
                if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                  return (
                    <text
                      x={viewBox.cx}
                      y={viewBox.cy}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className="fill-foreground text-sm font-semibold"
                    >
                      <tspan x={viewBox.cx} className="text-2xl font-bold">
                        {formatCurrency(total, { maximumFractionDigits: 0 })}
                      </tspan>
                      <tspan x={viewBox.cx} y={(viewBox.cy ?? 0) + 18} className="fill-muted-foreground text-xs font-normal">
                        monthly spend
                      </tspan>
                    </text>
                  );
                }
                return null;
              }}
            />
          </Pie>
          <Legend verticalAlign="bottom" content={<ChartLegendContent />} />
        </PieChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
};
