import type {
  GaitFrame, Horse, SessionSummary, JointMetric,
  SymmetryScore, Insight, StrideRow, HistoryPoint,
} from "./types";

// ─── Joints config ────────────────────────────────────────────────────────────
export const JOINTS = [
  { key: "hip",             label: "Hip",             color: "#0f766e" },
  { key: "stifle",          label: "Stifle",          color: "#0891b2" },
  { key: "hock",            label: "Hock",            color: "#7c3aed" },
  { key: "shoulder",        label: "Shoulder",        color: "#d97706" },
  { key: "elbow",           label: "Elbow",           color: "#dc2626" },
  { key: "knee",            label: "Knee",            color: "#db2777" },
  { key: "fetlockFore",     label: "Fetlock (F)",     color: "#0d9488" },
  { key: "fetlockHind",     label: "Fetlock (H)",     color: "#65a30d" },
  { key: "protractionFore", label: "Protraction (F)", color: "#9333ea" },
  { key: "protractionHind", label: "Protraction (H)", color: "#ea580c" },
];

// ─── Horses ───────────────────────────────────────────────────────────────────
export const MOCK_HORSES: Horse[] = [
  { id: "h1", name: "Vanguard",  breed: "Warmblood",       age: 8,  colour: "Bay",          owner: "Dr. A. Mitchell", lastSession: "2026-06-28", sessionCount: 14 },
  { id: "h2", name: "Aurora",    breed: "Irish Sport Horse",age: 5, colour: "Grey",         owner: "Dr. A. Mitchell", lastSession: "2026-06-21", sessionCount: 7  },
  { id: "h3", name: "Meridian",  breed: "Thoroughbred",    age: 6,  colour: "Chestnut",     owner: "Equine Physio Co", lastSession: "2026-06-14", sessionCount: 9  },
  { id: "h4", name: "Helix",     breed: "Dutch Warmblood", age: 10, colour: "Dark Bay",     owner: "Equine Physio Co", lastSession: "2026-05-30", sessionCount: 22 },
];

// ─── Sessions ─────────────────────────────────────────────────────────────────
export const MOCK_SESSIONS: SessionSummary[] = [
  { id: "s1", horseId: "h1", horseName: "Vanguard",  date: "2026-06-28", gait: "Trot",   duration: "0:42", fps: 30, totalFrames: 1260, status: "done",       qualityScore: 91 },
  { id: "s2", horseId: "h1", horseName: "Vanguard",  date: "2026-06-14", gait: "Canter", duration: "1:08", fps: 30, totalFrames: 2040, status: "done",       qualityScore: 87 },
  { id: "s3", horseId: "h2", horseName: "Aurora",    date: "2026-06-21", gait: "Walk",   duration: "1:22", fps: 30, totalFrames: 2460, status: "processing", qualityScore: 0  },
  { id: "s4", horseId: "h3", horseName: "Meridian",  date: "2026-06-14", gait: "Trot",   duration: "0:55", fps: 30, totalFrames: 1650, status: "done",       qualityScore: 78 },
  { id: "s5", horseId: "h4", horseName: "Helix",     date: "2026-05-30", gait: "Trot",   duration: "0:38", fps: 30, totalFrames: 1140, status: "done",       qualityScore: 83 },
  { id: "s6", horseId: "h3", horseName: "Meridian",  date: "2026-06-28", gait: "Trot",   duration: "—",    fps: 30, totalFrames: 0,    status: "queued",     qualityScore: 0  },
];

// ─── ROM table data ───────────────────────────────────────────────────────────
export const JOINT_METRICS: JointMetric[] = [
  { joint: "Poll",          side: "bilateral", min: 12, max: 38, rom: 26, refRom: 28, flag: "normal"  },
  { joint: "Shoulder",      side: "left",      min: 97, max: 131,rom: 34, refRom: 36, flag: "normal"  },
  { joint: "Shoulder",      side: "right",     min: 95, max: 128,rom: 33, refRom: 36, flag: "normal"  },
  { joint: "Elbow",         side: "left",      min: 82, max: 114,rom: 32, refRom: 34, flag: "normal"  },
  { joint: "Elbow",         side: "right",     min: 80, max: 111,rom: 31, refRom: 34, flag: "normal"  },
  { joint: "Knee (Carpus)", side: "left",      min: 68, max: 104,rom: 36, refRom: 38, flag: "normal"  },
  { joint: "Knee (Carpus)", side: "right",     min: 65, max: 98, rom: 33, refRom: 38, flag: "caution" },
  { joint: "Fetlock (F)",   side: "left",      min:162, max: 198,rom: 36, refRom: 38, flag: "normal"  },
  { joint: "Fetlock (F)",   side: "right",     min:160, max: 188,rom: 28, refRom: 38, flag: "alert"   },
  { joint: "Hip",           side: "left",      min:105, max: 136,rom: 31, refRom: 32, flag: "normal"  },
  { joint: "Hip",           side: "right",     min:103, max: 134,rom: 31, refRom: 32, flag: "normal"  },
  { joint: "Stifle",        side: "left",      min: 90, max: 128,rom: 38, refRom: 40, flag: "normal"  },
  { joint: "Stifle",        side: "right",     min: 88, max: 125,rom: 37, refRom: 40, flag: "normal"  },
  { joint: "Hock",          side: "left",      min: 74, max: 114,rom: 40, refRom: 42, flag: "normal"  },
  { joint: "Hock",          side: "right",     min: 72, max: 110,rom: 38, refRom: 42, flag: "caution" },
  { joint: "Fetlock (H)",   side: "left",      min:158, max: 196,rom: 38, refRom: 40, flag: "normal"  },
  { joint: "Fetlock (H)",   side: "right",     min:155, max: 192,rom: 37, refRom: 40, flag: "normal"  },
];

// ─── Symmetry scores ──────────────────────────────────────────────────────────
export const SYMMETRY_SCORES: SymmetryScore[] = [
  { metric: "Fetlock (F) ROM", left: 36, right: 28, si: 24.3, threshold: 15, flag: "alert"   },
  { metric: "Fetlock (H) ROM", left: 38, right: 37, si:  2.7, threshold: 15, flag: "normal"  },
  { metric: "Knee (Carpus) ROM",left: 36,right: 33, si:  8.6, threshold: 15, flag: "caution" },
  { metric: "Fore Protraction", left: 32, right: 27, si: 16.9, threshold: 12, flag: "alert"  },
  { metric: "Hind Protraction", left: 28, right: 27, si:  3.6, threshold: 12, flag: "normal" },
  { metric: "Hock ROM",         left: 40, right: 38, si:  5.1, threshold: 15, flag: "normal" },
];

// ─── Insights ─────────────────────────────────────────────────────────────────
export const INSIGHTS: Insight[] = [
  {
    category: "alert",
    title: "Right forelimb fetlock ROM reduced",
    body: "Right fore fetlock ROM is 28° vs. 36° on the left — a symmetry index of 24.3%, exceeding the 15% threshold. Consider veterinary assessment of the right fore pastern/fetlock region.",
  },
  {
    category: "alert",
    title: "Forelimb protraction asymmetry detected",
    body: "Left fore protraction (32°) exceeds right (27°) with SI = 16.9%. This pattern is consistent with compensatory loading of the left forelimb. Correlated with the right fore fetlock finding.",
  },
  {
    category: "warning",
    title: "Right carpus ROM slightly reduced",
    body: "Right knee ROM is 33° vs. reference 38°. SI = 8.6%, within threshold but worth monitoring on next session.",
  },
  {
    category: "positive",
    title: "Hind limb symmetry within normal limits",
    body: "Fetlock (H) SI = 2.7%, protraction SI = 3.6%, hock SI = 5.1% — all well within the 15% threshold. Hind limb mechanics appear balanced.",
  },
  {
    category: "info",
    title: "Overall gait quality score: 91 / 100",
    body: "High cadence consistency (CV 3.8%) and strong keypoint confidence (mean 0.94) across all 12 joints. Video quality is sufficient for clinical reporting.",
  },
];

// ─── Per-stride breakdown ─────────────────────────────────────────────────────
export const STRIDE_DATA: StrideRow[] = [
  { stride: 1, duration: 0.68, hipRom: 30, fetlockForeRom: 33, fetlockHindRom: 37, protractionSI:  3.2 },
  { stride: 2, duration: 0.67, hipRom: 31, fetlockForeRom: 30, fetlockHindRom: 38, protractionSI: 14.8 },
  { stride: 3, duration: 0.69, hipRom: 32, fetlockForeRom: 28, fetlockHindRom: 37, protractionSI: 18.2 },
  { stride: 4, duration: 0.67, hipRom: 30, fetlockForeRom: 31, fetlockHindRom: 39, protractionSI: 12.1 },
  { stride: 5, duration: 0.68, hipRom: 31, fetlockForeRom: 26, fetlockHindRom: 38, protractionSI: 21.4 },
  { stride: 6, duration: 0.70, hipRom: 33, fetlockForeRom: 29, fetlockHindRom: 37, protractionSI: 16.0 },
  { stride: 7, duration: 0.66, hipRom: 30, fetlockForeRom: 27, fetlockHindRom: 40, protractionSI: 22.8 },
  { stride: 8, duration: 0.68, hipRom: 31, fetlockForeRom: 28, fetlockHindRom: 38, protractionSI: 19.3 },
];

// ─── Horse history (trend data) ───────────────────────────────────────────────
export const HORSE_HISTORY: HistoryPoint[] = [
  { date: "2026-01-12", fetlockForeRom: 37, fetlockHindRom: 39, protractionSI:  3.1, pollStability: 94 },
  { date: "2026-02-08", fetlockForeRom: 36, fetlockHindRom: 38, protractionSI:  4.2, pollStability: 93 },
  { date: "2026-03-15", fetlockForeRom: 35, fetlockHindRom: 38, protractionSI:  6.8, pollStability: 91 },
  { date: "2026-04-05", fetlockForeRom: 33, fetlockHindRom: 38, protractionSI: 10.1, pollStability: 90 },
  { date: "2026-04-28", fetlockForeRom: 31, fetlockHindRom: 37, protractionSI: 13.4, pollStability: 88 },
  { date: "2026-05-20", fetlockForeRom: 30, fetlockHindRom: 37, protractionSI: 15.9, pollStability: 87 },
  { date: "2026-06-14", fetlockForeRom: 29, fetlockHindRom: 38, protractionSI: 18.2, pollStability: 86 },
  { date: "2026-06-28", fetlockForeRom: 28, fetlockHindRom: 38, protractionSI: 24.3, pollStability: 84 },
];

// ─── Gait frame data ──────────────────────────────────────────────────────────
function generateGaitData(): GaitFrame[] {
  const frames = 150;
  const data: GaitFrame[] = [];
  for (let i = 0; i < frames; i++) {
    const t = (i / frames) * 8 * Math.PI;
    data.push({
      frame: i, time: parseFloat((i / 30).toFixed(2)),
      hip:             parseFloat((118 + 17 * Math.sin(t) + 3 * Math.sin(2*t)).toFixed(1)),
      stifle:          parseFloat((109 + 21 * Math.sin(t + 0.25)).toFixed(1)),
      hock:            parseFloat((92  + 26 * Math.sin(t + 0.55) + 5 * Math.sin(2*t+0.5)).toFixed(1)),
      shoulder:        parseFloat((113 + 19 * Math.sin(t + Math.PI + 0.1)).toFixed(1)),
      elbow:           parseFloat((97  + 17 * Math.sin(t + Math.PI + 0.35)).toFixed(1)),
      knee:            parseFloat((88  + 23 * Math.sin(t + Math.PI + 0.65)).toFixed(1)),
      fetlockFore:     parseFloat((177 + 21 * Math.sin(t + Math.PI + 0.95)).toFixed(1)),
      fetlockHind:     parseFloat((173 + 19 * Math.sin(t + 0.9)).toFixed(1)),
      protractionFore: parseFloat((10  + 22 * Math.sin(t + Math.PI + 0.15)).toFixed(1)),
      protractionHind: parseFloat((8   + 20 * Math.sin(t + 0.1)).toFixed(1)),
    });
  }
  return data;
}

export const GAIT_DATA = generateGaitData();
