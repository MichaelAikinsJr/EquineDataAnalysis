import { AlertTriangle, ArrowRight, CheckCircle, XCircle } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
type CardStatus = "good" | "watch" | "concern";

interface MetricRow {
  label: string;
  left?:  string;
  right?: string;
  diff?:  string;
  value?: string;
}

interface NarrativeCard {
  id:          string;
  title:       string;
  headline:    string;
  explanation: string;
  status:      CardStatus;
  metrics?:    MetricRow[];
  note?:       string;
}

// ─── Mock narrative derived from Vanguard trot session ───────────────────────
const CARDS: NarrativeCard[] = [
  {
    id: "stride",
    title: "Stride",
    headline: "Landing evenly on all four",
    explanation:
      "All four legs are taking equal weight. Vanguard feels balanced on every stride. Cadence was consistent throughout the session with very little variation.",
    status: "good",
    metrics: [
      { label: "Strides detected", value: "8" },
      { label: "Avg stride duration", value: "0.68 s" },
      { label: "Cadence consistency", value: "CV 3.8%" },
    ],
  },
  {
    id: "front",
    title: "Front Legs",
    headline: "Right front is bending less than the left",
    explanation:
      "The right front leg is moving through a smaller range than the left. This kind of difference — especially in the fetlock — can be an early sign of stiffness or discomfort. It's worth monitoring over the next few sessions.",
    status: "concern",
    metrics: [
      { label: "Fetlock ROM",   left: "36°", right: "28°", diff: "8°"  },
      { label: "Protraction",   left: "32°", right: "27°", diff: "5°"  },
      { label: "Carpus ROM",    left: "36°", right: "33°", diff: "3°"  },
    ],
    note: "The right front fetlock is bending 24% less than the left — above the 15% attention threshold.",
  },
  {
    id: "back",
    title: "Back Legs",
    headline: "Moving evenly through the back legs",
    explanation:
      "Both hind legs are bending through a very similar range and pushing off at the same angle. Vanguard's hindquarters look balanced and symmetrical in this session.",
    status: "good",
    metrics: [
      { label: "Fetlock (H) ROM", left: "38°", right: "37°", diff: "1°"  },
      { label: "Hock ROM",        left: "40°", right: "38°", diff: "2°"  },
      { label: "Protraction SI",  value: "3.6%"                           },
    ],
  },
  {
    id: "hips",
    title: "Hips",
    headline: "Moving evenly through the hips",
    explanation:
      "Both hips are rising and falling by the same amount. Even hip movement suggests the hindquarters are comfortable and sharing load equally — a good sign.",
    status: "good",
    metrics: [
      { label: "Hip ROM",    left: "31°", right: "31°", diff: "0°"  },
      { label: "Stifle ROM", left: "38°", right: "37°", diff: "1°"  },
    ],
  },
  {
    id: "head",
    title: "Head & Neck",
    headline: "Head carriage is steady",
    explanation:
      "Vanguard's head stays level through the stride. A steady head means the horse is comfortable moving forward and isn't compensating for pain elsewhere — a positive indicator.",
    status: "good",
    metrics: [
      { label: "Poll ROM",       value: "26°"  },
      { label: "Poll stability", value: "84 / 100" },
    ],
  },
  {
    id: "flexibility",
    title: "Flexibility",
    headline: "Some joints could be bending more evenly",
    explanation:
      "Most joints are bending symmetrically, but the right front leg is consistently bending through a smaller range. This is the clearest pattern in today's data — it shows up in the fetlock, carpus, and protraction angle together, which makes it worth taking seriously.",
    status: "watch",
    metrics: [
      { label: "Right fore fetlock SI", value: "24.3%  ⚠ Alert"  },
      { label: "Right fore protraction SI", value: "16.9%  ⚠ Alert" },
      { label: "Right carpus SI",       value: "8.6%  · Watch"   },
    ],
    note: "All three right forelimb metrics are elevated together, which increases confidence in the finding.",
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

const STATUS_CFG: Record<CardStatus, { Icon: typeof CheckCircle; iconCls: string; border: string; badge: string; badgeText: string }> = {
  good:    { Icon: CheckCircle,  iconCls: "text-emerald-600", border: "border-border",        badge: "bg-emerald-50  text-emerald-700 border-emerald-200", badgeText: "Good"    },
  watch:   { Icon: AlertTriangle,iconCls: "text-amber-500",   border: "border-amber-200",     badge: "bg-amber-50   text-amber-700   border-amber-200",    badgeText: "Watch"   },
  concern: { Icon: XCircle,      iconCls: "text-red-500",     border: "border-red-200",       badge: "bg-red-50     text-red-700     border-red-200",       badgeText: "Concern" },
};

function MetricTable({ rows }: { rows: MetricRow[] }) {
  return (
    <div className="mt-3 border-t border-border pt-3 space-y-1.5">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center justify-between text-xs">
          <span className="text-muted-foreground">{r.label}</span>
          {r.value ? (
            <span className="font-mono font-medium text-foreground">{r.value}</span>
          ) : (
            <div className="flex items-center gap-3 font-mono font-medium">
              <span className="text-foreground">L&nbsp;{r.left}</span>
              <span className="text-foreground">R&nbsp;{r.right}</span>
              <span className={`${parseFloat(r.diff ?? "0") >= 8 ? "text-red-600" : parseFloat(r.diff ?? "0") >= 4 ? "text-amber-600" : "text-emerald-600"}`}>
                Δ {r.diff}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ─── Quality score ring ───────────────────────────────────────────────────────
function QualityRing({ score }: { score: number }) {
  const r       = 28;
  const circ    = 2 * Math.PI * r;
  const dash    = (score / 100) * circ;
  const color   = score >= 85 ? "#059669" : score >= 70 ? "#d97706" : "#dc2626";
  const label   = score >= 85 ? "Good" : score >= 70 ? "Fair" : "Low";

  return (
    <div className="flex flex-col items-center">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
        <circle
          cx="36" cy="36" r={r} fill="none"
          stroke={color} strokeWidth="5"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 36 36)"
        />
        <text x="36" y="34" textAnchor="middle" dominantBaseline="middle"
          fontSize="15" fontWeight="700" fill={color} fontFamily="JetBrains Mono, monospace">
          {score}
        </text>
        <text x="36" y="50" textAnchor="middle" fontSize="8" fill="#64748b" fontFamily="Inter, sans-serif">
          {label}
        </text>
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
interface NarrativeReportProps {
  horseName:    string;
  qualityScore: number;
  gait:         string;
  strideCount:  number;
}

export default function NarrativeReport({ horseName, qualityScore, gait, strideCount }: NarrativeReportProps) {
  const hasIssue = CARDS.some((c) => c.status !== "good");

  return (
    <div className="space-y-5">

      {/* ── Summary header ── */}
      <div className="bg-white border border-border rounded-lg p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Plain Language Report
            </p>
            <h2 className="text-base font-semibold text-foreground mb-1">
              Here's what {horseName} is telling you
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {hasIssue
                ? `${horseName} is moving well overall. The right front leg is bending through a slightly smaller range than the left — worth watching over the next few sessions and sharing with your vet or physio.`
                : `${horseName} is moving evenly and symmetrically. All key metrics are within normal limits. Record again in a few weeks to track trends over time.`}
            </p>
            <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground font-mono">
              <span>{strideCount} strides</span>
              <span>·</span>
              <span>{gait}</span>
              <span>·</span>
              <span className="text-emerald-600">12/12 keypoints</span>
            </div>
          </div>
          <QualityRing score={qualityScore} />
        </div>
      </div>

      {/* ── Metric cards grid ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {CARDS.map((card) => {
          const cfg = STATUS_CFG[card.status];
          return (
            <div key={card.id} className={`bg-white border rounded-lg p-5 ${cfg.border}`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <cfg.Icon size={15} className={cfg.iconCls} />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{card.title}</span>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                  {cfg.badgeText}
                </span>
              </div>

              <p className="text-sm font-semibold text-foreground mb-1">{card.headline}</p>
              <p className="text-xs text-muted-foreground leading-relaxed">{card.explanation}</p>

              {card.note && (
                <div className="mt-3 flex items-start gap-2 text-xs bg-amber-50 border border-amber-200 rounded px-2.5 py-2">
                  <AlertTriangle size={11} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <span className="text-amber-800">{card.note}</span>
                </div>
              )}

              {card.metrics && <MetricTable rows={card.metrics} />}

              <button className="mt-3 flex items-center gap-1 text-xs text-teal-700 font-medium hover:underline">
                See full data <ArrowRight size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* ── What you can do ── */}
      <div className="bg-slate-50 border border-border rounded-lg p-5">
        <h3 className="text-sm font-semibold text-foreground mb-2">What you can do</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Record again in a few days and compare. You'll see whether these patterns stay the same,
          improve, or progress — and you'll have objective data to share with your vet or physiotherapist.
          Pay particular attention to how the right front leg loads during the next session.
        </p>
        <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <CheckCircle size={12} className="text-teal-600 mt-0.5 flex-shrink-0" />
          <span>Right front fetlock and protraction are flagged — prioritise these in your follow-up.</span>
        </div>
      </div>

    </div>
  );
}
