import { CartesianGrid, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from "recharts";
import { formatCurrency } from "../lib/utils";

export interface ScatterDatum {
  name: string;
  cost: number;
  waste: number;
}

export const CostVsWasteScatter = ({ data }: { data: ScatterDatum[] }) => (
  <div className="h-80 w-full">
    <ResponsiveContainer width="100%" height="100%">
      <ScatterChart margin={{ left: 10, right: 20, top: 20, bottom: 20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
        <XAxis
          type="number"
          dataKey="cost"
          name="Monthly cost"
          tickFormatter={(value) => formatCurrency(value, { maximumFractionDigits: 0 })}
          stroke="#94a3b8"
        />
        <YAxis type="number" dataKey="waste" name="CPU waste %" unit="%" stroke="#94a3b8" />
        <Tooltip
          cursor={{ strokeDasharray: "3 3" }}
          formatter={(value, name) =>
            name === "Monthly cost" ? formatCurrency(value as number, { maximumFractionDigits: 0 }) : `${value}%`
          }
          contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b" }}
        />
        <Scatter data={data} fill="#c084fc" />
      </ScatterChart>
    </ResponsiveContainer>
  </div>
);
