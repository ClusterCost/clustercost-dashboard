import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "../lib/utils";

export interface NamespaceCostDatum {
  name: string;
  value: number;
}

export const TopNamespacesBarChart = ({ data }: { data: NamespaceCostDatum[] }) => (
  <div className="h-80 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ left: 24, right: 16, top: 10, bottom: 10 }}>
        <XAxis type="number" tickFormatter={(value) => formatCurrency(value, { maximumFractionDigits: 0 })} hide />
        <YAxis type="category" dataKey="name" width={140} tick={{ fill: "#94a3b8", fontSize: 12 }} />
        <Tooltip
          formatter={(value: number) => formatCurrency(value, { maximumFractionDigits: 0 })}
          contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b" }}
        />
        <Bar dataKey="value" fill="#38bdf8" radius={[0, 4, 4, 0]} barSize={18} />
      </BarChart>
    </ResponsiveContainer>
  </div>
);
