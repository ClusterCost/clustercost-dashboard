import { Pie, PieChart, ResponsiveContainer, Tooltip, Cell, Legend } from "recharts";
import { formatCurrency, type Environment } from "../lib/utils";

export interface EnvironmentChartDatum {
  environment: Environment | "non-prod" | "unknown";
  value: number;
}

const COLORS: Record<string, string> = {
  production: "#10B981",
  preprod: "#0EA5E9",
  development: "#FBBF24",
  system: "#94A3B8",
  unknown: "#A855F7",
  "non-prod": "#F97316"
};

export const CostByEnvironmentChart = ({ data }: { data: EnvironmentChartDatum[] }) => (
  <div className="h-72 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie dataKey="value" data={data} nameKey="environment" innerRadius={70} outerRadius={110} paddingAngle={4}>
          {data.map((entry) => (
            <Cell key={entry.environment} fill={COLORS[entry.environment] ?? "#64748b"} />
          ))}
        </Pie>
        <Tooltip
          formatter={(value: number) => formatCurrency(value, { maximumFractionDigits: 0 })}
          contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b" }}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  </div>
);
