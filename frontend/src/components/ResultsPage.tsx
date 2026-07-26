import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Film, Activity, FileText } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import SummaryCard from "./SummaryCard";
import Layout from "./Layout";
import api from "../api";
// import NormalizedCurveChart from "../components/NormalizedCurveChart";

interface CurveSummary {
  p0?: number;
  p25?: number;
  p50?: number;
  p75?: number;
  p100?: number;
  max?: number;
  min?: number;
  rom?: number;
  num_cycles?: number;
}

interface AngleSeriesMeta {
  key: string;
  label: string;
  triplet?: string[];
}

interface CurveSidePayload {
  cycles?: number[][];
  mean?: number[];
  std?: number[];
  summary?: CurveSummary;
}

interface SummaryMetrics {
  [key: string]: unknown;
}

interface SessionResults {
  id: string;
  horse_id?: string;
  horse_name: string;
  gait: string;
  notes?: string;
  original_filename?: string;
  video?: string | null;
  annotated_video?: string | null;
  status: string;
  progress?: number;
  current_step?: string;
  orientation?: string;
  visible_side?: string;
  fps?: number;
  total_frames?: number;
  quality_score?: number | null;
  symmetry_index?: number | null;
  narrative_report?: string;
  error_message?: string;
  created_at: string;
  updated_at?: string;
  poll_rom_norm?: number | null;
  wither_rom_norm?: number | null;
  pelvis_rom_norm?: number | null;
  pelvis_roll_mean_abs_norm?: number | null;
  fore_protraction_asymmetry_deg?: number | null;
  hind_protraction_asymmetry_deg?: number | null;
  summary_metrics?: SummaryMetrics | null;
  tracking_mode?: "yolo26" | "classical";
  selected_keypoints?: string[];
  available_angle_series?: AngleSeriesMeta[];
}

interface FrameRow {
  frame_index: number;
  timestamp_sec: number;
  keypoints_norm?: number[][];
  bbox_xyxy_norm?: number[];

  frame_quality_score?: number | null;
  orientation?: string | null;
  visible_side?: string | null;

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

  left_hind_protraction_signed_deg?: number | null;
  left_fore_protraction_signed_deg?: number | null;
  right_hind_protraction_signed_deg?: number | null;
  right_fore_protraction_signed_deg?: number | null;

  left_hind_protraction_deg?: number | null;
  left_fore_protraction_deg?: number | null;
  right_hind_protraction_deg?: number | null;
  right_fore_protraction_deg?: number | null;

  poll_y_norm?: number | null;
  wither_y_norm?: number | null;
  pelvis_mid_y_norm?: number | null;
  head_mid_y_norm?: number | null;
  left_pelvis_y_norm?: number | null;
  right_pelvis_y_norm?: number | null;
  pelvis_roll_diff_norm?: number | null;

  metrics_json?: Record<string, unknown> | null;
}

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

const ANGLE_SERIES = [
  { key: "left_hip_angle_deg", label: "Left Hip", color: "#ef4444" },
  { key: "right_hip_angle_deg", label: "Right Hip", color: "#f87171" },
  { key: "left_stifle_angle_deg", label: "Left Stifle", color: "#f97316" },
  { key: "right_stifle_angle_deg", label: "Right Stifle", color: "#fb923c" },
  { key: "left_hock_angle_deg", label: "Left Hock", color: "#eab308" },
  { key: "right_hock_angle_deg", label: "Right Hock", color: "#facc15" },
  { key: "left_hind_fetlock_angle_deg", label: "Left Hind Fetlock", color: "#22c55e" },
  { key: "right_hind_fetlock_angle_deg", label: "Right Hind Fetlock", color: "#4ade80" },
  { key: "left_shoulder_angle_deg", label: "Left Shoulder", color: "#06b6d4" },
  { key: "right_shoulder_angle_deg", label: "Right Shoulder", color: "#22d3ee" },
  { key: "left_elbow_angle_deg", label: "Left Elbow", color: "#3b82f6" },
  { key: "right_elbow_angle_deg", label: "Right Elbow", color: "#60a5fa" },
  { key: "left_knee_angle_deg", label: "Left Knee", color: "#8b5cf6" },
  { key: "right_knee_angle_deg", label: "Right Knee", color: "#a78bfa" },
  { key: "left_fore_fetlock_angle_deg", label: "Left Fore Fetlock", color: "#ec4899" },
  { key: "right_fore_fetlock_angle_deg", label: "Right Fore Fetlock", color: "#f472b6" },
] as const;

function formatDate(value?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function formatNumber(value?: number | null, digits = 1, asPercent = false) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  if (asPercent) {
    return `${(value * 100).toFixed(digits)}%`;
  }
  return value.toFixed(digits);
}

function toAbsoluteUrl(path?: string | null) {
  if (!path) return "";
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `http://localhost:8000${path}`;
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {sub ? <p className="text-xs text-muted-foreground mt-0.5">{sub}</p> : null}
    </div>
  );
}

function finiteValues(values: Array<number | null | undefined>) {
  return values.filter((v): v is number => typeof v === "number" && Number.isFinite(v));
}

function meanAbsDifference(
  left: Array<number | null | undefined>,
  right: Array<number | null | undefined>
) {
  const n = Math.min(left.length, right.length);
  const diffs: number[] = [];

  for (let i = 0; i < n; i++) {
    const a = left[i];
    const b = right[i];
    if (
      typeof a === "number" &&
      Number.isFinite(a) &&
      typeof b === "number" &&
      Number.isFinite(b)
    ) {
      diffs.push(Math.abs(a - b));
    }
  }

  if (diffs.length === 0) return null;
  return diffs.reduce((sum, v) => sum + v, 0) / diffs.length;
}

export default function ResultsPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [results, setResults] = useState<SessionResults | null>(null);
  const [frames, setFrames] = useState<FrameRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleAngles, setVisibleAngles] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!sessionId) return;

    let mounted = true;

    const loadResults = async () => {
      try {
        setLoading(true);
        setError("");

        const [resultsRes, framesRes] = await Promise.all([
          api.get(`/api/sessions/${sessionId}/results/`),
          api.get(`/api/sessions/${sessionId}/frames/`),
        ]);

        const frameData = Array.isArray(framesRes.data)
          ? framesRes.data
          : framesRes.data.results || [];

        if (!mounted) return;

        setResults(resultsRes.data);
        setFrames(frameData);
      } catch (err: any) {
        console.error(err);
        if (!mounted) return;
        setError(err.response?.data?.detail || "Could not load results.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadResults();

    return () => {
      mounted = false;
    };
  }, [sessionId]);

  const activeAngleSeries = useMemo(() => {
    if (results?.tracking_mode === "classical") {
      const raw = Array.isArray(results.available_angle_series)
        ? results.available_angle_series
        : [];

      return raw.map((item, idx) => ({
        key: item.key,
        label: item.label,
        color: CLASSICAL_COLORS[idx % CLASSICAL_COLORS.length],
      }));
    }

    return [...ANGLE_SERIES];
  }, [results]);

  useEffect(() => {
    setVisibleAngles(new Set(activeAngleSeries.map((s) => s.key)));
  }, [activeAngleSeries]);

  const toggleAngle = (key: string) => {
    setVisibleAngles((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const chartData = useMemo(() => {
    const fps = results?.fps && Number.isFinite(results.fps) ? results.fps : 30;

    return frames.map((f) => {
      const row: Record<string, number | string | null> = {
        time: Number((f.timestamp_sec ?? f.frame_index / fps).toFixed(2)),
      };

      if (results?.tracking_mode === "classical") {
        for (const series of activeAngleSeries) {
          const raw = f.metrics_json?.[series.key];
          row[series.key] =
            typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        }
      } else {
        for (const series of activeAngleSeries) {
          const raw = (f as any)[series.key];
          row[series.key] =
            typeof raw === "number" && Number.isFinite(raw) ? raw : null;
        }
      }

      return row;
    });
  }, [frames, results?.fps, results?.tracking_mode, activeAngleSeries]);

  const symmetryRows = useMemo(() => {
    if (frames.length === 0) return [];

    const rows: Array<{ label: string; value: string }> = [];

    if (typeof results?.symmetry_index === "number") {
      rows.push({
        label: "Overall symmetry index",
        value: `${results.symmetry_index.toFixed(1)}°`,
      });
    }

    if (typeof results?.fore_protraction_asymmetry_deg === "number") {
      rows.push({
        label: "Fore protraction asymmetry",
        value: `${results.fore_protraction_asymmetry_deg.toFixed(1)}°`,
      });
    }

    if (typeof results?.hind_protraction_asymmetry_deg === "number") {
      rows.push({
        label: "Hind protraction asymmetry",
        value: `${results.hind_protraction_asymmetry_deg.toFixed(1)}°`,
      });
    }

    const leftFore = frames.map((f) => f.left_fore_protraction_deg);
    const rightFore = frames.map((f) => f.right_fore_protraction_deg);
    const leftHind = frames.map((f) => f.left_hind_protraction_deg);
    const rightHind = frames.map((f) => f.right_hind_protraction_deg);

    const foreFramewiseAsym = meanAbsDifference(leftFore, rightFore);
    const hindFramewiseAsym = meanAbsDifference(leftHind, rightHind);

    if (typeof foreFramewiseAsym === "number") {
      rows.push({
        label: "Fore framewise mean |L-R|",
        value: `${foreFramewiseAsym.toFixed(1)}°`,
      });
    }

    if (typeof hindFramewiseAsym === "number") {
      rows.push({
        label: "Hind framewise mean |L-R|",
        value: `${hindFramewiseAsym.toFixed(1)}°`,
      });
    }

    const foreSigned = finiteValues([
      ...frames.map((f) => f.left_fore_protraction_signed_deg),
      ...frames.map((f) => f.right_fore_protraction_signed_deg),
    ]);

    const hindSigned = finiteValues([
      ...frames.map((f) => f.left_hind_protraction_signed_deg),
      ...frames.map((f) => f.right_hind_protraction_signed_deg),
    ]);

    if (foreSigned.length > 0) {
      rows.push({
        label: "Fore signed protraction span",
        value: `${(Math.max(...foreSigned) - Math.min(...foreSigned)).toFixed(1)}°`,
      });
    }

    if (hindSigned.length > 0) {
      rows.push({
        label: "Hind signed protraction span",
        value: `${(Math.max(...hindSigned) - Math.min(...hindSigned)).toFixed(1)}°`,
      });
    }

    if (typeof results?.pelvis_roll_mean_abs_norm === "number") {
      rows.push({
        label: "Pelvis roll mean abs",
        value: results.pelvis_roll_mean_abs_norm.toFixed(4),
      });
    }

    return rows;
  }, [
    frames,
    results?.symmetry_index,
    results?.fore_protraction_asymmetry_deg,
    results?.hind_protraction_asymmetry_deg,
    results?.pelvis_roll_mean_abs_norm,
  ]);

  const alerts = useMemo(() => {
    const out: string[] = [];

    if (
      typeof results?.fore_protraction_asymmetry_deg === "number" &&
      results.fore_protraction_asymmetry_deg > 15
    ) {
      out.push(
        `Forelimb protraction asymmetry ${results.fore_protraction_asymmetry_deg.toFixed(1)} exceeds the 15.0 review threshold.`
      );
    }

    if (
      typeof results?.hind_protraction_asymmetry_deg === "number" &&
      results.hind_protraction_asymmetry_deg > 15
    ) {
      out.push(
        `Hindlimb protraction asymmetry ${results.hind_protraction_asymmetry_deg.toFixed(1)} exceeds the 15.0 review threshold.`
      );
    }

    if (typeof results?.quality_score === "number" && results.quality_score < 70) {
      out.push(
        `Quality score ${results.quality_score.toFixed(1)} suggests lower-confidence tracking quality.`
      );
    }

    if (results?.status === "failed" && results.error_message) {
      out.push(results.error_message);
    }

    if (frames.length === 0 && results?.status === "done") {
      out.push("Analysis completed but no frame-level angle data was returned.");
    }

    return out;
  }, [results, frames.length]);

  const videoUrl =
    toAbsoluteUrl(results?.annotated_video) || toAbsoluteUrl(results?.video) || "";

  if (loading) {
    return (
      <Layout current="sessions">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="bg-white border border-border rounded-lg p-6 text-sm text-slate-600">
            Loading results...
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout current="sessions">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-4">
          <button
            onClick={() => navigate("/sessions")}
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft size={14} />
            Back to sessions
          </button>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        </div>
      </Layout>
    );
  }

  if (!results) {
    return (
      <Layout current="sessions">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="bg-white border border-border rounded-lg p-6 text-sm text-slate-600">
            No results found.
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout current="sessions">
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <button
              onClick={() => navigate("/sessions")}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-3"
            >
              <ArrowLeft size={14} />
              Back to sessions
            </button>

            <h1 className="text-lg font-semibold text-foreground">Results</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Session analysis summary for {results.horse_name}
            </p>
          </div>

          <div className="text-right">
            <p className="text-xs text-muted-foreground">Status</p>
            <p className="text-sm font-semibold text-foreground capitalize">
              {results.status}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <div className="bg-white border border-border rounded-lg p-4 min-h-[92px]">
            <p className="text-xs text-muted-foreground">Horse</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {results.horse_name}
            </p>
          </div>

          <div className="bg-white border border-border rounded-lg p-4 min-h-[92px]">
            <p className="text-xs text-muted-foreground">Gait</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {results.gait || "—"}
            </p>
          </div>

          <div className="bg-white border border-border rounded-lg p-4 min-h-[92px]">
            <p className="text-xs text-muted-foreground">Symmetry Index</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {formatNumber(results.symmetry_index)}
            </p>
          </div>

          <div className="bg-white border border-border rounded-lg p-4 min-h-[92px]">
            <p className="text-xs text-muted-foreground">FPS</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {formatNumber(results.fps)}
            </p>
          </div>

          <div className="bg-white border border-border rounded-lg p-4 min-h-[92px]">
            <p className="text-xs text-muted-foreground">Frames</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {results.total_frames ?? frames.length ?? 0}
            </p>
          </div>

          <div className="bg-white border border-border rounded-lg p-4 min-h-[92px]">
            <p className="text-xs text-muted-foreground">Poll ROM</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {formatNumber(results.poll_rom_norm, 2, true)}
            </p>
          </div>

          <div className="bg-white border border-border rounded-lg p-4 min-h-[92px]">
            <p className="text-xs text-muted-foreground">Wither ROM</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {formatNumber(results.wither_rom_norm, 2, true)}
            </p>
          </div>

          <div className="bg-white border border-border rounded-lg p-4 min-h-[92px]">
            <p className="text-xs text-muted-foreground">Pelvis ROM</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {formatNumber(results.pelvis_rom_norm, 2, true)}
            </p>
          </div>

          <div className="bg-white border border-border rounded-lg p-4 min-h-[92px]">
            <p className="text-xs text-muted-foreground">Pelvis Roll</p>
            <p className="text-sm font-semibold text-foreground mt-1">
              {formatNumber(results.pelvis_roll_mean_abs_norm, 2, true)}
            </p>
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <Film size={15} className="text-teal-700" />
            <h2 className="text-sm font-semibold text-foreground">Annotated Video</h2>
          </div>

          {videoUrl ? (
            <video
              controls
              className="w-full rounded-md border border-border bg-black"
              src={videoUrl}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No video preview available.</p>
          )}
        </div>

        <SummaryCard data={frames} />

        <div className="bg-white border border-border rounded-lg p-5">
          <SectionHead
            title="Joint Angles Over Time"
            sub={`${frames.length} frames · ${formatNumber(results.fps, 0)} fps · ${(results.gait || "unknown").toLowerCase()} gait cycle`}
          />

          <div className="flex flex-wrap gap-1.5 mb-4">
            {activeAngleSeries.map(({ key, label, color }) => {
              const active = visibleAngles.has(key);

              return (
                <button
                  key={key}
                  onClick={() => toggleAngle(key)}
                  type="button"
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded border text-xs font-medium transition-all ${
                    active
                      ? "bg-white border-border text-foreground shadow-sm"
                      : "bg-transparent border-transparent text-muted-foreground opacity-40 hover:opacity-60"
                  }`}
                >
                  <span
                    className="w-2 h-2 rounded-full inline-block"
                    style={{ backgroundColor: active ? color : "#94a3b8" }}
                  />
                  {label}
                </button>
              );
            })}
          </div>

          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis
                  dataKey="time"
                  tick={{ fontSize: 10, fontFamily: '"JetBrains Mono",monospace' }}
                  tickFormatter={(v) => `${v}s`}
                  stroke="#e2e8f0"
                />
                <YAxis
                  tick={{ fontSize: 10, fontFamily: '"JetBrains Mono",monospace' }}
                  tickFormatter={(v) => `${v}°`}
                  stroke="#e2e8f0"
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: "6px",
                    fontSize: "11px",
                    fontFamily: '"JetBrains Mono",monospace',
                  }}
                  labelStyle={{ color: "#94a3b8" }}
                  itemStyle={{ color: "#e2e8f0" }}
                  formatter={(v: number | null) =>
                    typeof v === "number" && Number.isFinite(v)
                      ? [`${v.toFixed(1)}°`, undefined]
                      : ["—", undefined]
                  }
                  labelFormatter={(l) => `t = ${l}s`}
                />
                {activeAngleSeries
                  .filter((j) => visibleAngles.has(j.key))
                  .map(({ key, label, color }) => (
                    <Line
                      key={`results-line-${key}`}
                      type="monotone"
                      dataKey={key}
                      name={label}
                      stroke={color}
                      dot={false}
                      strokeWidth={1.5}
                      activeDot={{ r: 3 }}
                      connectNulls={false}
                    />
                  ))}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-muted-foreground">
              No joint-angle time-series data available.
            </p>
          )}
        </div>

        <div className="bg-white border border-border rounded-lg p-5 space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={15} className="text-amber-600" />
            <h2 className="text-sm font-semibold text-foreground">Alerts</h2>
          </div>

          {alerts.length > 0 ? (
            <ul className="space-y-2">
              {alerts.map((alert, idx) => (
                <li
                  key={idx}
                  className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2"
                >
                  {alert}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No alerts generated.</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4">
          <div className="bg-white border border-border rounded-lg p-5">
            <div className="flex items-center gap-2 mb-3">
              <Activity size={15} className="text-teal-700" />
              <h2 className="text-sm font-semibold text-foreground">Symmetry</h2>
            </div>

            <div className="space-y-2">
              {symmetryRows.length > 0 ? (
                symmetryRows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-muted-foreground">{row.label}</span>
                    <span className="font-mono text-foreground">{row.value}</span>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No symmetry data available.</p>
              )}
            </div>
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg p-5">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={15} className="text-teal-700" />
            <h2 className="text-sm font-semibold text-foreground">Narrative Report</h2>
          </div>

          <p className="text-sm text-slate-700 leading-6 whitespace-pre-line">
            {results.narrative_report || "No narrative report available."}
          </p>
        </div>

        <div className="bg-white border border-border rounded-lg p-5">
          <h2 className="text-sm font-semibold text-foreground mb-3">Session Details</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Session ID</span>
              <span className="font-mono text-foreground break-all text-right">
                {results.id}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Created</span>
              <span className="text-foreground">{formatDate(results.created_at)}</span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Original filename</span>
              <span className="text-foreground text-right">
                {results.original_filename || "—"}
              </span>
            </div>

            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Current step</span>
              <span className="text-foreground text-right">
                {results.current_step || "—"}
              </span>
            </div>
          </div>

          {results.notes && (
            <div className="mt-4 pt-4 border-t border-border">
              <p className="text-xs text-muted-foreground mb-1">Notes</p>
              <p className="text-sm text-slate-700">{results.notes}</p>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}