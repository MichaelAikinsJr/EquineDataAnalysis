import { useEffect, useState } from "react";
import { ArrowRight, Calendar, Hash } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Layout from "./Layout";
import api from "../api";

const COLOUR_DOT: Record<string, string> = {
  Bay: "#7B3F00",
  Grey: "#9CA3AF",
  Chestnut: "#C0622A",
  "Dark Bay": "#3D1A00",
};

type Horse = {
  id: string;
  name: string;
  breed?: string;
  colour?: string;
  age?: number;
  owner?: string;
  created_at?: string;
  session_count?: number;
  last_session?: string | null;
};

interface HorsesListPageProps {
  onLogout: () => void;
}

export default function HorsesListPage({ onLogout }: HorsesListPageProps) {
  const navigate = useNavigate();

  const [horses, setHorses] = useState<Horse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const loadHorses = async () => {
      try {
        setLoading(true);
        setError("");

        const res = await api.get("/api/horses/");
        const data = Array.isArray(res.data) ? res.data : res.data.results || [];

        if (!mounted) return;
        setHorses(data);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError("Could not load horse profiles.");
      } finally {
        if (mounted) setLoading(false);
      }
    };

    loadHorses();

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <Layout current="horses" onLogout={onLogout}>
      <div className="max-w-5xl mx-auto px-6 py-7 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-lg font-semibold text-foreground">Horses</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {loading ? "Loading profiles..." : `${horses.length} registered profiles`}
            </p>
          </div>

          <button
            onClick={() => navigate("/upload")}
            className="text-xs bg-teal-700 hover:bg-teal-800 text-white px-3 py-2 rounded-md font-medium transition-colors"
          >
            + New session
          </button>
        </div>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="bg-white border border-border rounded-lg p-5 animate-pulse">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 rounded-full bg-slate-200" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-slate-200 rounded" />
                    <div className="h-3 w-40 bg-slate-100 rounded" />
                    <div className="h-3 w-24 bg-slate-100 rounded" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="h-16 bg-slate-100 rounded-md" />
                  <div className="h-16 bg-slate-100 rounded-md" />
                </div>
                <div className="h-10 bg-slate-100 rounded-md" />
              </div>
            ))}
          </div>
        ) : horses.length === 0 ? (
          <div className="bg-white border border-border rounded-lg p-8 text-center">
            <p className="text-sm text-muted-foreground">No horses uploaded yet.</p>
            <button
              onClick={() => navigate("/upload")}
              className="mt-4 text-sm bg-teal-700 hover:bg-teal-800 text-white px-4 py-2 rounded-md font-medium transition-colors"
            >
              Upload first session
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {horses.map((h) => (
              <div
                key={h.id}
                className="bg-white border border-border rounded-lg p-5 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-full flex-shrink-0 border-2 border-white shadow-sm"
                    style={{ backgroundColor: COLOUR_DOT[h.colour || ""] ?? "#64748b" }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{h.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.breed || "Unknown breed"}
                      {h.colour ? ` · ${h.colour}` : ""}
                      {typeof h.age === "number" ? ` · ${h.age} yr` : ""}
                    </p>
                    <p className="text-xs text-muted-foreground">{h.owner || "Your stable"}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-muted/40 rounded-md px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Hash size={10} className="text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Sessions
                      </span>
                    </div>
                    <p className="text-sm font-semibold font-mono text-foreground">
                      {h.session_count ?? 0}
                    </p>
                  </div>

                  <div className="bg-muted/40 rounded-md px-3 py-2">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Calendar size={10} className="text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        Created
                      </span>
                    </div>
                    <p className="text-sm font-semibold font-mono text-foreground">
                      {h.created_at ? h.created_at.slice(0, 10) : "—"}
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => navigate(`/horse-history/${h.id}`)}
                  className="w-full flex items-center justify-between px-3 py-2 border border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-700 rounded-md text-xs font-medium transition-colors"
                >
                  View history & trends
                  <ArrowRight size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}