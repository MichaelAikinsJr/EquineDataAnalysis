import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Clock, Eye, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Layout from "./Layout";
import api from "../api";

interface SessionListPageProps {
  onLogout: () => void;
}

type SessionItem = {
  id: string;
  horse_id?: string;
  horse_name?: string;
  gait?: string;
  notes?: string;
  original_filename?: string;
  status: "done" | "processing" | "queued" | "failed" | "uploaded";
  progress?: number;
  current_step?: string;
  quality_score?: number | null;
  symmetry_index?: number | null;
  created_at?: string;
  updated_at?: string;
};

const STATUS_CFG: Record<
  string,
  { label: string; cls: string; icon: typeof Clock; spin: boolean }
> = {
  done: {
    label: "Done",
    cls: "text-emerald-700 bg-emerald-50 border-emerald-200",
    icon: CheckCircle,
    spin: false,
  },
  processing: {
    label: "Processing",
    cls: "text-blue-700 bg-blue-50 border-blue-200",
    icon: Loader2,
    spin: true,
  },
  queued: {
    label: "Queued",
    cls: "text-slate-600 bg-slate-50 border-slate-200",
    icon: Clock,
    spin: false,
  },
  uploaded: {
    label: "Uploaded",
    cls: "text-slate-600 bg-slate-50 border-slate-200",
    icon: Clock,
    spin: false,
  },
  failed: {
    label: "Failed",
    cls: "text-red-700 bg-red-50 border-red-200",
    icon: AlertCircle,
    spin: false,
  },
};

export default function SessionListPage({ onLogout }: SessionListPageProps) {
  const navigate = useNavigate();

  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadSessions = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await api.get("/api/sessions/");
        const data = Array.isArray(res.data) ? res.data : res.data.results || [];

        if (!mounted) return;
        setSessions(data);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError("Could not load sessions.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadSessions();

    return () => {
      mounted = false;
    };
  }, []);

  const openSession = (session: SessionItem) => {
    if (session.status === "done") {
      navigate(`/results/${session.id}`);
      return;
    }

    navigate(`/processing/${session.id}`);
  };

  return (
    <Layout current="sessions" onLogout={onLogout}>
      <div className="max-w-5xl mx-auto px-6 py-7 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Sessions</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              All analysis sessions across your horses
            </p>
          </div>

          <button
            onClick={() => navigate("/upload")}
            className="text-xs bg-teal-700 hover:bg-teal-800 text-white px-3 py-2 rounded-md font-medium transition-colors"
          >
            + Upload video
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
            {error}
          </div>
        )}

        <div className="bg-white border border-border rounded-lg overflow-hidden">
          {loading ? (
            <div className="p-5 text-sm text-muted-foreground">Loading sessions...</div>
          ) : sessions.length === 0 ? (
            <div className="p-5 text-sm text-muted-foreground">No sessions uploaded yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-muted/20 border-b border-border">
                    {["Horse", "Created", "Gait", "Filename", "Quality", "Symmetry", "Status", ""].map(
                      (h, i) => (
                        <th
                          key={i}
                          className={`py-3 px-4 font-medium text-muted-foreground text-left ${
                            i === 0 ? "pl-5" : ""
                          }`}
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>

                <tbody>
                  {sessions.map((s) => {
                    const sc = STATUS_CFG[s.status] || STATUS_CFG.queued;
                    const StatusIcon = sc.icon;

                    return (
                      <tr
                        key={s.id}
                        className="border-b border-border/40 last:border-0 hover:bg-muted/20 transition-colors"
                      >
                        <td className="py-3 pl-5 pr-4 font-medium text-foreground">
                          {s.horse_name || "Unknown horse"}
                        </td>

                        <td className="py-3 px-4 font-mono text-muted-foreground">
                          {s.created_at ? s.created_at.slice(0, 10) : "—"}
                        </td>

                        <td className="py-3 px-4 text-muted-foreground">
                          {s.gait || "—"}
                        </td>

                        <td className="py-3 px-4 text-muted-foreground max-w-[180px] truncate">
                          {s.original_filename || "—"}
                        </td>

                        <td className="py-3 px-4">
                          {typeof s.quality_score === "number" ? (
                            <span
                              className={`font-mono font-semibold ${
                                s.quality_score >= 85
                                  ? "text-emerald-700"
                                  : s.quality_score >= 70
                                  ? "text-amber-700"
                                  : "text-red-700"
                              }`}
                            >
                              {s.quality_score}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          {typeof s.symmetry_index === "number" ? (
                            <span
                              className={`font-mono font-semibold ${
                                s.symmetry_index > 15 ? "text-red-700" : "text-emerald-700"
                              }`}
                            >
                              {s.symmetry_index}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[10px] font-medium ${sc.cls}`}
                          >
                            <StatusIcon size={9} className={sc.spin ? "animate-spin" : ""} />
                            {sc.label}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <button
                            onClick={() => openSession(s)}
                            className="inline-flex items-center gap-1 text-xs text-teal-700 font-medium hover:underline"
                          >
                            <Eye size={11} />
                            {s.status === "done" ? "View" : "Open"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}