import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

type SidePayload = {
  cycles?: number[][];
  mean?: number[];
  std?: number[];
  summary?: Record<string, number>;
};

type Props = {
  title: string;
  xPercent: number[];
  left?: SidePayload;
  right?: SidePayload;
};


export function NormalizedCurveChart({
  title,
  xPercent,
  left,
  right,
}: Props) {
  const data = xPercent.map((x, i) => ({
    x,
    rightMean: right?.mean?.[i] ?? null,
    leftMean: left?.mean?.[i] ?? null,
  }));

  return (
    <div className="bg-white border border-border rounded-lg p-5">
      <h3 className="text-lg font-semibold mb-4">{title}</h3>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="4 4" />
            <XAxis
              dataKey="x"
              label={{ value: "Step Length (%)", position: "insideBottom", offset: -4 }}
            />
            <YAxis />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="rightMean"
              stroke="#2563eb"
              strokeWidth={2}
              dot={false}
              name="Right AVG"
            />
            <Line
              type="monotone"
              dataKey="leftMean"
              stroke="#dc2626"
              strokeWidth={2}
              dot={false}
              name="Left AVG"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 pr-4">Metric</th>
              <th className="text-left py-2 pr-4">Right</th>
              <th className="text-left py-2 pr-4">Left</th>
            </tr>
          </thead>
          <tbody>
            {["p0", "p25", "p50", "p75", "p100", "max", "min", "rom", "num_cycles"].map((k) => (
              <tr key={k} className="border-b">
                <td className="py-2 pr-4">{k}</td>
                <td className="py-2 pr-4">{right?.summary?.[k] ?? "-"}</td>
                <td className="py-2 pr-4">{left?.summary?.[k] ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}