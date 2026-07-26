// src/components/HorseHistoryPage.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import type { Page } from "../lib/types";
import Layout from "./Layout";
import api from "../api";

interface HorseDetail {
  id: string;
  name: string;
  breed?: string;
  colour?: string;
  age?: number | null;
  owner?: string;
}

interface SessionRow {
  id: string;
  gait?: string;
  status: string;
  quality_score?: number | null;
  qualityScore?: number | null;
  created_at?: string;
  date?: string;
  duration?: string;
  total_frames?: number;
  fps?: number | null;
}

interface TrendPoint {
  date: string;
  fetlockForeRom?: number | null;
  fetlockHindRom?: number | null;
  protractionSI?: number | null;
  pollStability?: number | null;
}

type HistoryKey = Exclude<keyof TrendPoint, "date">;

type TrendChartProps = {
  data: TrendPoint[];
  dataKey: HistoryKey;
  label: string;
  color: string;
  refValue?: number;
  unit: string;
  threshold?: number;
};

function formatMetric(value: number | null | undefined, unit = "", digits = 1) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "—";
  return `${value.toFixed(digits)}${unit}`;
}

function formatDate(value?: string) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString();
}

function SectionHead({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {sub ? <p className="text-xs text-muted-foreground mt-0.5">{sub}</p> : null}
    </div>
  );
}

function TrendChart({
  data,
  dataKey,
  label,
  color,
  refValue,
  unit,
  threshold,
}: TrendChartProps) {
  const last = data[data.length - 1];
  const prev = data[data.length - 2];

  const lastValue = last?.[dataKey];
  const prevValue = prev?.[dataKey];
  const delta =
    typeof lastValue === "number" && typeof prevValue === "number"
      ? lastValue - prevValue
      : 0;

  return (
    <div className="bg-white border border-border rounded-lg p-5">
      <div className="flex items-start justify-between mb-1 gap-4">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <div className="text-right shrink-0">
          <p className="text-lg font-semibold font-mono text-foreground">
            {formatMetric(lastValue, unit)}
          </p>
          <p
            className={`text-xs font-mono ${
              delta < 0
                ? "text-red-600"
                : delta > 0
                ? "text-emerald-600"
                : "text-muted-foreground"
            }`}
          >
            {delta > 0 ? "▲" : delta < 0 ? "▼" : "─"} {Math.abs(delta).toFixed(1)}
            {unit} vs prev.
          </p>
        </div>
      </div>

      {data.length > 0 ? (
        <ResponsiveContainer width="100%" height={150}>
          <LineChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fontFamily: '"JetBrains Mono",monospace' }}
              tickFormatter={(v: string) => (typeof v === "string" ? v.slice(5) : "")}
              stroke="#e2e8f0"
            />
            <YAxis
              tick={{ fontSize: 9, fontFamily: '"JetBrains Mono",monospace' }}
              tickFormatter={(v: number) => `${v}${unit}`}
              stroke="#e2e8f0"
              width={42}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: "6px",
                fontSize: "11px",
              }}
              labelStyle={{ color: "#94a3b8" }}
              itemStyle={{ color: "#e2e8f0" }}
              formatter={(v: number) => [formatMetric(v, unit), label]}
            />
            {refValue !== undefined && (
              <ReferenceLine
                y={refValue}
                stroke={color}
                strokeDasharray="4 2"
                strokeOpacity={0.4}
                label={{
                  value: `Ref ${refValue}${unit}`,
                  position: "insideTopRight",
                  fontSize: 8,
                  fill: color,
                }}
              />
            )}
            {threshold !== undefined && (
              <ReferenceLine
                y={threshold}
                stroke="#dc2626"
                strokeDasharray="3 2"
                strokeOpacity={0.5}
                label={{
                  value: `Alert ${threshold}${unit}`,
                  position: "insideTopRight",
                  fontSize: 8,
                  fill: "#dc2626",
                }}
              />
            )}
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke={color}
              dot={{ r: 3, fill: color }}
              strokeWidth={2}
              connectNulls={false}
            />
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div className="h-[150px] flex items-center justify-center text-xs text-muted-foreground">
          No trend data available.
        </div>
      )}
    </div>
  );
}

export default function HorseHistoryPage() {
  const { horseId = "" } = useParams();
  const navigate = useNavigate();

  const [horse, setHorse] = useState<HorseDetail | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [history, setHistory] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!horseId) {
      setError("Missing horse id.");
      setLoading(false);
      return;
    }

    let mounted = true;

    const loadHorsePage = async () => {
      try {
        setLoading(true);
        setError("");

        const [horseRes, sessionsRes, historyRes] = await Promise.all([
          api.get(`/api/horses/${horseId}/`),
          api.get(`/api/horses/${horseId}/sessions/`),
          api.get(`/api/horses/${horseId}/history/`),
        ]);

        if (!mounted) return;

        setHorse(horseRes.data);

        const sessionData = Array.isArray(sessionsRes.data)
          ? sessionsRes.data
          : sessionsRes.data.results || [];
        setSessions(sessionData);

        const historyData = Array.isArray(historyRes.data)
          ? historyRes.data
          : historyRes.data.results || [];
        setHistory(historyData);
      } catch (err: any) {
        console.error(err);
        if (!mounted) return;
        setError(err.response?.data?.detail || "Could not load horse history.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadHorsePage();

    return () => {
      mounted = false;
    };
  }, [horseId]);

  const sessionRows = useMemo(() => {
    return sessions.map((s) => {
      const quality =
        typeof s.quality_score === "number"
          ? s.quality_score
          : typeof s.qualityScore === "number"
          ? s.qualityScore
          : null;

      return {
        ...s,
        displayDate: s.date || formatDate(s.created_at),
        displayDuration:
          s.duration ||
          (typeof s.total_frames === "number" && typeof s.fps === "number" && s.fps > 0
            ? `${(s.total_frames / s.fps).toFixed(1)}s`
            : "—"),
        displayQuality: quality,
      };
    });
  }, [sessions]);

  const handleNavigate = (p: Page) => {
    if (p === "horses") navigate("/horses");
    else if (p === "dashboard") navigate("/dashboard");
    else if (p === "sessions") navigate("/sessions");
    else if (p === "upload") navigate("/upload");
  };

  if (loading) {
    return (
      <Layout current="horses" onNavigate={handleNavigate} onLogout={() => navigate("/logout")}>
        <div className="max-w-5xl mx-auto px-6 py-7">
          <div className="bg-white border border-border rounded-lg p-6 text-sm text-slate-600">
            Loading horse history...
          </div>
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout current="horses" onNavigate={handleNavigate} onLogout={() => navigate("/logout")}>
        <div className="max-w-5xl mx-auto px-6 py-7 space-y-4">
          <button
            onClick={() => navigate("/horses")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} />
            Horses
          </button>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            {error}
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout current="horses" onNavigate={handleNavigate} onLogout={() => navigate("/logout")}>
      <div className="max-w-5xl mx-auto px-6 py-7 space-y-7">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/horses")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} />
            Horses
          </button>

          <span className="text-muted-foreground/40">/</span>

          <div>
            <h1 className="text-lg font-semibold text-foreground">
              {horse?.name || "Horse"}
            </h1>
            <p className="text-xs text-muted-foreground">
              {[
                horse?.breed,
                horse?.colour,
                typeof horse?.age === "number" ? `${horse.age} yr` : null,
                horse?.owner,
              ]
                .filter(Boolean)
                .join(" · ") || "No horse details available."}
            </p>
          </div>
        </div>

        <div>
          <SectionHead
            title="Gait Trends Over Time"
            sub={`${history.length} recorded points`}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TrendChart
              data={history}
              dataKey="fetlockForeRom"
              label="Fetlock (F) ROM"
              color="#0f766e"
              refValue={38}
              unit="°"
            />
            <TrendChart
              data={history}
              dataKey="fetlockHindRom"
              label="Fetlock (H) ROM"
              color="#0891b2"
              refValue={40}
              unit="°"
            />
            <TrendChart
              data={history}
              dataKey="protractionSI"
              label="Fore Protraction Symmetry Index"
              color="#dc2626"
              threshold={15}
              unit="%"
            />
            <TrendChart
              data={history}
              dataKey="pollStability"
              label="Poll Stability Score"
              color="#7c3aed"
              unit=""
            />
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg overflow-hidden">
          <div className="px-5 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Session History</h2>
          </div>

          <table className="w-full text-xs">
            <thead>
              <tr className="bg-muted/20 border-b border-border">
                {["Date", "Gait", "Duration", "Quality", "Status", ""].map((h, i) => (
                  <th
                    key={i}
                    className={`py-2.5 px-4 font-medium text-muted-foreground text-left ${
                      i === 0 ? "pl-5" : ""
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sessionRows.length > 0 ? (
                sessionRows.map((s: any) => (
                  <tr
                    key={s.id}
                    className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
                  >
                    <td className="py-3 pl-5 pr-4 font-mono text-muted-foreground">
                      {s.displayDate}
                    </td>
                    <td className="py-3 px-4 text-foreground">{s.gait || "—"}</td>
                    <td className="py-3 px-4 font-mono text-muted-foreground">
                      {s.displayDuration}
                    </td>
                    <td className="py-3 px-4">
                      {typeof s.displayQuality === "number" ? (
                        <span
                          className={`font-mono font-semibold ${
                            s.displayQuality >= 85
                              ? "text-emerald-700"
                              : s.displayQuality >= 70
                              ? "text-amber-700"
                              : "text-red-700"
                          }`}
                        >
                          {s.displayQuality.toFixed(1)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border capitalize ${
                          s.status === "done"
                            ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                            : s.status === "processing"
                            ? "text-blue-700 bg-blue-50 border-blue-200"
                            : s.status === "failed"
                            ? "text-red-700 bg-red-50 border-red-200"
                            : "text-slate-600 bg-slate-50 border-slate-200"
                        }`}
                      >
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      {s.status === "done" ? (
                        <button
                          onClick={() => navigate(`/results/${s.id}`)}
                          className="text-xs text-teal-700 font-medium hover:underline"
                        >
                          View →
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground">
                    No session history available.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}