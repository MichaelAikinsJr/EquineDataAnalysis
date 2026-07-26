import { useMemo } from "react";
import { TrendingUp } from "lucide-react";

interface AngleSeriesMeta {
  key: string;
  label: string;
  triplet?: string[];
}

interface FrameRow {
  frame_index: number;
  timestamp_sec: number;

  left_hip_angle_deg?: number | null;
  left_stifle_angle_deg?: number | null;
  left_hock_angle_deg?: number | null;
  left_hind_fetlock_angle_deg?: number | null;
  left_shoulder_angle_deg?: number | null;
  left_elbow_angle_deg?: number | null;
  left_knee_angle_deg?: number | null;
  left_fore_fetlock_angle_deg?: number | null;

  right_hip_angle_deg?: number | null;
  right_stifle_angle_deg?: number | null;
  right_hock_angle_deg?: number | null;
  right_hind_fetlock_angle_deg?: number | null;
  right_shoulder_angle_deg?: number | null;
  right_elbow_angle_deg?: number | null;
  right_knee_angle_deg?: number | null;
  right_fore_fetlock_angle_deg?: number | null;

  left_hind_protraction_deg?: number | null;
  left_fore_protraction_deg?: number | null;
  right_hind_protraction_deg?: number | null;
  right_fore_protraction_deg?: number | null;

  poll_y_norm?: number | null;
  wither_y_norm?: number | null;
  pelvis_mid_y_norm?: number | null;
  pelvis_roll_diff_norm?: number | null;

  metrics_json?: Record<string, unknown> | null;
}

interface SummaryCardProps {
  data: FrameRow[];
  trackingMode?: "yolo26" | "classical";
  availableAngleSeries?: AngleSeriesMeta[];
}

type MetricKey = keyof FrameRow;
type MetricFormat = "deg" | "percent";

const METRICS: ReadonlyArray<{
  key: MetricKey;
  label: string;
  color: string;
  format: MetricFormat;
}> = [
  { key: "left_hip_angle_deg", label: "Left Hip", color: "#3b82f6", format: "deg" },
  { key: "right_hip_angle_deg", label: "Right Hip", color: "#60a5fa", format: "deg" },

  { key: "left_stifle_angle_deg", label: "Left Stifle", color: "#06b6d4", format: "deg" },
  { key: "right_stifle_angle_deg", label: "Right Stifle", color: "#67e8f9", format: "deg" },

  { key: "left_hock_angle_deg", label: "Left Hock", color: "#10b981", format: "deg" },
  { key: "right_hock_angle_deg", label: "Right Hock", color: "#34d399", format: "deg" },

  { key: "left_hind_fetlock_angle_deg", label: "Left Hind Fetlock", color: "#14b8a6", format: "deg" },
  { key: "right_hind_fetlock_angle_deg", label: "Right Hind Fetlock", color: "#2dd4bf", format: "deg" },

  { key: "left_shoulder_angle_deg", label: "Left Shoulder", color: "#f59e0b", format: "deg" },
  { key: "right_shoulder_angle_deg", label: "Right Shoulder", color: "#fbbf24", format: "deg" },

  { key: "left_elbow_angle_deg", label: "Left Elbow", color: "#ef4444", format: "deg" },
  { key: "right_elbow_angle_deg", label: "Right Elbow", color: "#f87171", format: "deg" },

  { key: "left_knee_angle_deg", label: "Left Knee", color: "#8b5cf6", format: "deg" },
  { key: "right_knee_angle_deg", label: "Right Knee", color: "#a78bfa", format: "deg" },

  { key: "left_fore_fetlock_angle_deg", label: "Left Fore Fetlock", color: "#ec4899", format: "deg" },
  { key: "right_fore_fetlock_angle_deg", label: "Right Fore Fetlock", color: "#f472b6", format: "deg" },

  { key: "left_fore_protraction_deg", label: "Left Fore Protraction", color: "#84cc16", format: "deg" },
  { key: "right_fore_protraction_deg", label: "Right Fore Protraction", color: "#a3e635", format: "deg" },

  { key: "left_hind_protraction_deg", label: "Left Hind Protraction", color: "#a855f7", format: "deg" },
  { key: "right_hind_protraction_deg", label: "Right Hind Protraction", color: "#c084fc", format: "deg" },

  { key: "poll_y_norm", label: "Poll Vertical", color: "#0f766e", format: "percent" },
  { key: "wither_y_norm", label: "Wither Vertical", color: "#0891b2", format: "percent" },
  { key: "pelvis_mid_y_norm", label: "Pelvis Vertical", color: "#7c3aed", format: "percent" },
  { key: "pelvis_roll_diff_norm", label: "Pelvis Roll Diff", color: "#be185d", format: "percent" },
] as const;

const CLASSICAL_COLORS = [
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#06b6d4",
  "#3b82f6",
  "#8b5cf6",
  "#ec4899",
];

function formatMetric(value: number, format: MetricFormat) {
  if (format === "percent") {
    return `${(value * 100).toFixed(2)}%`;
  }
  return `${value.toFixed(1)}°`;
}

function finiteNumbers(values: Array<number | null | undefined>) {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

export default function SummaryCard({
  data,
  trackingMode,
  availableAngleSeries = [],
}: SummaryCardProps) {
  const stats = useMemo(() => {
    if (trackingMode === "classical") {
      return availableAngleSeries
        .map((series, idx) => {
          const vals = finiteNumbers(
            data.map((frame) => {
              const raw = frame.metrics_json?.[series.key];
              return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
            })
          );

          const hasData = vals.length > 0;
          const min = hasData ? Math.min(...vals) : 0;
          const max = hasData ? Math.max(...vals) : 0;
          const rom = hasData ? max - min : 0;

          return {
            key: series.key,
            label: series.label,
            color: CLASSICAL_COLORS[idx % CLASSICAL_COLORS.length],
            format: "deg" as MetricFormat,
            min,
            max,
            rom,
            hasData,
          };
        })
        .filter((row) => row.hasData);
    }

    return METRICS.map(({ key, label, color, format }) => {
      const vals = finiteNumbers(
        data.map((d) => {
          const raw = d[key];
          return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        })
      );

      const hasData = vals.length > 0;
      const min = hasData ? Math.min(...vals) : 0;
      const max = hasData ? Math.max(...vals) : 0;
      const rom = hasData ? max - min : 0;

      return {
        key: String(key),
        label,
        color,
        format,
        min,
        max,
        rom,
        hasData,
      };
    }).filter((row) => row.hasData);
  }, [data, trackingMode, availableAngleSeries]);

  const maxRom = Math.max(...stats.map((s) => s.rom), 1);

  return (
    <div className="bg-white border border-border rounded-lg p-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp size={14} className="text-blue-600" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-foreground">
          Range of Motion Summary
        </h3>
      </div>

      {stats.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-2 pr-4 text-muted-foreground font-medium">
                  Metric
                </th>
                <th className="text-right py-2 px-3 text-muted-foreground font-mono font-medium">
                  Min
                </th>
                <th className="text-right py-2 px-3 text-muted-foreground font-mono font-medium">
                  Max
                </th>
                <th className="text-right py-2 px-3 text-muted-foreground font-mono font-medium">
                  ROM
                </th>
                <th className="py-2 pl-4 text-muted-foreground font-medium w-40"></th>
              </tr>
            </thead>
            <tbody>
              {stats.map(({ key, label, color, format, min, max, rom }) => (
                <tr
                  key={String(key)}
                  className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: color }}
                      />
                      <span className="font-medium text-foreground">{label}</span>
                    </div>
                  </td>

                  <td className="text-right py-2.5 px-3 font-mono text-muted-foreground">
                    {formatMetric(min, format)}
                  </td>

                  <td className="text-right py-2.5 px-3 font-mono text-muted-foreground">
                    {formatMetric(max, format)}
                  </td>

                  <td className="text-right py-2.5 px-3 font-mono font-semibold text-foreground">
                    {formatMetric(rom, format)}
                  </td>

                  <td className="py-2.5 pl-4">
                    <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full">
                      <div
                        className="h-full rounded-full"
                        style={{
                          backgroundColor: color,
                          width: `${(rom / maxRom) * 100}%`,
                          opacity: 0.75,
                        }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No range-of-motion summary available.</p>
      )}
    </div>
  );
}