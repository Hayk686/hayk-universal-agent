import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { ActivityPoint } from "./chart-types";

export default function RequestActivityChart({ data }: { data: ActivityPoint[] }) {
  return (
    <div className="hermes-chart-area w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 0, right: 2, left: -22, bottom: 0 }}>
          <defs>
            <linearGradient id="reqFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id="errFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,0.08)" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: "#94a3b8", fontSize: 10 }}
            axisLine={false}
            tickLine={false}
            width={28}
          />
          <Tooltip
            contentStyle={{
              background: "#1e293b",
              border: "1px solid rgba(148,163,184,0.2)",
              borderRadius: 8,
              fontSize: 12,
            }}
            labelStyle={{ color: "#e2e8f0" }}
          />
          <Legend
            verticalAlign="top"
            align="right"
            iconType="circle"
            iconSize={6}
            wrapperStyle={{ fontSize: 9, color: "#94a3b8", paddingBottom: 4 }}
          />
          <Area
            type="monotone"
            dataKey="requests"
            name="Requests"
            stroke="#3b82f6"
            strokeWidth={2}
            fill="url(#reqFill)"
          />
          <Area
            type="monotone"
            dataKey="errors"
            name="Errors"
            stroke="#60a5fa"
            strokeWidth={1.5}
            fill="url(#errFill)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
