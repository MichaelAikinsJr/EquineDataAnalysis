import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Clock,
  TrendingUp,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Layout from "./Layout";
import api from "../api";

interface DashboardPageProps {
  onLogout: () => void;
}

type Horse = {
  id: string;
  name: string;
  breed?: string;
  session_count?: number;
};

type Session = {
  id: string;
  horse?: string;
  horse_id?: string;
  horse_name?: string;
  gait?: string;
  date?: string;
  created_at?: string;
  status: "queued" | "processing" | "done" | "failed";
  progress?: number;
  quality_score?: number;
  symmetry_index?: number;
  current_step?: string;
};

export default function DashboardPage({ onLogout }: DashboardPageProps) {
  const navigate = useNavigate();

  const [horses, setHorses] = useState<Horse[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadDashboard = async () => {
      try {
        setLoading(true);
        setError("");

        const [horsesRes, sessionsRes] = await Promise.all([
          api.get("/api/horses/"),
          api.get("/api/sessions/"),
        ]);

        if (!mounted) return;

        const horsesData = Array.isArray(horsesRes.data)
          ? horsesRes.data
          : horsesRes.data.results || [];

        const sessionsData = Array.isArray(sessionsRes.data)
          ? sessionsRes.data
          : sessionsRes.data.results || [];

        setHorses(horsesData);
        setSessions(sessionsData);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError("Could not load dashboard data.");
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    loadDashboard();

    return () => {
      mounted = false;
    };
  }, []);

  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => {
        const aDate = new Date(a.created_at || a.date || 0).getTime();
        const bDate = new Date(b.created_at || b.date || 0).getTime();
        return bDate - aDate;
      })
      .slice(0, 4);
  }, [sessions]);

  const stats = useMemo(() => {
    const totalHorses = horses.length;
    const totalSessions = sessions.length;
    const pendingSessions = sessions.filter(
      (s) => s.status === "queued" || s.status === "processing"
    ).length;
    const alertSessions = sessions.filter(
      (s) => typeof s.symmetry_index === "number" && s.symmetry_index > 15
    ).length;

    const doneSessions = sessions.filter(
      (s) => s.status === "done" && typeof s.quality_score === "number"
    );

    const avgQuality =
      doneSessions.length > 0
        ? Math.round(
            doneSessions.reduce((sum, s) => sum + (s.quality_score || 0), 0) /
              doneSessions.length
          )
        : 0;

    return [
      {
        label: "Horses",
        value: String(totalHorses),
        sub: "Active profiles",
        color: "text-teal-700",
        bg: "bg-teal-50",
      },
      {
        label: "Sessions",
        value: String(totalSessions),
        sub: `${pendingSessions} pending analysis`,
        color: "text-indigo-700",
        bg: "bg-indigo-50",
      },
      {
        label: "Alerts",
        value: String(alertSessions),
        sub: "Require attention",
        color: "text-red-700",
        bg: "bg-red-50",
      },
      {
        label: "Avg Quality",
        value: String(avgQuality),
        sub: "Score out of 100",
        color: "text-emerald-700",
        bg: "bg-emerald-50",
      },
    ];
  }, [horses, sessions]);

  const topAlert = useMemo(() => {
    return sessions.find(
      (s) => s.status === "done" && typeof s.symmetry_index === "number" && s.symmetry_index > 15
    );
  }, [sessions]);

  return (
    <Layout current="dashboard" onLogout={onLogout}>
      <div className="max-w-5xl mx-auto px-6 py-7 space-y-7">
        <div>
          <h1 className="text-lg font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Here’s a summary of your recent activity and alerts.
          </p>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
            {error}
          </div>
        )}

        {topAlert && (
          <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <AlertTriangle size={15} className="text-amber-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-amber-800">
                {topAlert.horse_name || topAlert.horse || "Horse"} — asymmetry detected
              </p>
              <p className="text-xs text-amber-700 mt-0.5">
                Symmetry index {topAlert.symmetry_index}% exceeded the clinical threshold.
              </p>
            </div>
            <button
              onClick={() => navigate(`/results/${topAlert.id}`)}
              className="ml-auto flex-shrink-0 text-xs text-amber-700 font-medium underline-offset-2 hover:underline"
            >
              Review →
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map(({ label, value, sub, color, bg }) => (
            <div key={label} className="bg-white border border-border rounded-lg p-4">
              <div className={`w-8 h-8 rounded ${bg} flex items-center justify-center mb-3`}>
                <Activity size={14} className={color} />
              </div>
              <p className={`text-2xl font-semibold font-mono ${color}`}>{value}</p>
              <p className="text-xs font-medium text-foreground mt-0.5">{label}</p>
              <p className="text-xs text-muted-foreground">{sub}</p>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 bg-white border border-border rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h2 className="text-sm font-semibold text-foreground">Recent Sessions</h2>
              <button
                onClick={() => navigate("/sessions")}
                className="text-xs text-teal-700 hover:underline flex items-center gap-1"
              >
                View all <ArrowRight size={11} />
              </button>
            </div>

            <div>
              {loading ? (
                <div className="px-5 py-4 text-sm text-muted-foreground">Loading sessions...</div>
              ) : recentSessions.length === 0 ? (
                <div className="px-5 py-4 text-sm text-muted-foreground">No sessions yet.</div>
              ) : (
                recentSessions.map((s, i) => (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 px-5 py-3 ${
                      i < recentSessions.length - 1 ? "border-b border-border/50" : ""
                    } hover:bg-muted/30 transition-colors`}
                  >
                    <div
                      className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        s.status === "done"
                          ? "bg-emerald-50"
                          : s.status === "processing"
                          ? "bg-blue-50"
                          : "bg-slate-50"
                      }`}
                    >
                      {s.status === "done" && <CheckCircle size={13} className="text-emerald-600" />}
                      {s.status === "processing" && <Clock size={13} className="text-blue-600" />}
                      {s.status === "queued" && <Clock size={13} className="text-slate-400" />}
                      {s.status === "failed" && <AlertTriangle size={13} className="text-red-600" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">
                        {s.horse_name || s.horse || "Unknown horse"} — {s.gait || "Unknown gait"}
                      </p>
                      <p className="text-xs text-muted-foreground font-mono">
                        {s.created_at || s.date || "No date"}
                      </p>
                    </div>

                    {s.status === "done" ? (
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-xs font-mono font-semibold ${
                            (s.quality_score || 0) >= 85
                              ? "text-emerald-700"
                              : (s.quality_score || 0) >= 70
                              ? "text-amber-700"
                              : "text-red-700"
                          }`}
                        >
                          {s.quality_score ?? "-"}
                        </span>
                        <button
                          onClick={() => navigate(`/results/${s.id}`)}
                          className="text-xs text-teal-700 font-medium hover:underline"
                        >
                          View
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => navigate(`/processing/${s.id}`)}
                        className="text-xs text-teal-700 font-medium hover:underline"
                      >
                        Open
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-border rounded-lg p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">Quick Actions</h2>
              <div className="space-y-2">
                <button
                  onClick={() => navigate("/upload")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 bg-teal-700 hover:bg-teal-800 text-white rounded-md text-sm font-medium transition-colors"
                >
                  <TrendingUp size={14} />
                  Upload new video
                </button>

                <button
                  onClick={() => navigate("/horses")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 border border-border hover:bg-muted/40 text-foreground rounded-md text-sm font-medium transition-colors"
                >
                  <Activity size={14} className="text-muted-foreground" />
                  View horse profiles
                </button>

                <button
                  onClick={() => navigate("/sessions")}
                  className="w-full flex items-center gap-3 px-3 py-2.5 border border-border hover:bg-muted/40 text-foreground rounded-md text-sm font-medium transition-colors"
                >
                  <Activity size={14} className="text-muted-foreground" />
                  All sessions
                </button>
              </div>
            </div>

            <div className="bg-white border border-border rounded-lg p-5">
              <h2 className="text-sm font-semibold text-foreground mb-3">Horses</h2>
              <div className="space-y-2">
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading horses...</p>
                ) : horses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No horses uploaded yet.</p>
                ) : (
                  horses.slice(0, 5).map((h) => (
                    <button
                      key={h.id}
                      onClick={() => navigate(`/horse-history/${h.id}`)}
                      className="w-full flex items-center justify-between py-1 text-left hover:bg-muted/30 rounded px-2"
                    >
                      <div>
                        <p className="text-xs font-medium text-foreground">{h.name}</p>
                        <p className="text-xs text-muted-foreground">{h.breed || "Unknown breed"}</p>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">
                        {h.session_count ?? 0} sessions
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}