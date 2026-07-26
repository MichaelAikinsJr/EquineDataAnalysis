export type Page =
  | "login"
  | "dashboard"
  | "upload"
  | "processing"
  | "results"
  | "horses"
  | "horse-history"
  | "sessions";

export interface GaitFrame {
  frame: number;
  time: number;
  hip: number; stifle: number; hock: number;
  shoulder: number; elbow: number; knee: number;
  fetlockFore: number; fetlockHind: number;
  protractionFore: number; protractionHind: number;
}

export interface Horse {
  id: string;
  name: string;
  breed: string;
  age: number;
  colour: string;
  owner: string;
  lastSession: string;
  sessionCount: number;
}

export interface SessionSummary {
  id: string;
  horseId: string;
  horseName: string;
  date: string;
  gait: string;
  duration: string;
  fps: number;
  totalFrames: number;
  status: "done" | "processing" | "queued" | "error";
  qualityScore: number; // 0-100
}

export interface JointMetric {
  joint: string;
  side: "left" | "right" | "bilateral";
  min: number;
  max: number;
  rom: number;
  refRom: number;
  flag: "normal" | "caution" | "alert";
}

export interface SymmetryScore {
  metric: string;
  left: number;
  right: number;
  si: number;       // symmetry index %
  threshold: number;
  flag: "normal" | "caution" | "alert";
}

export interface Insight {
  category: "positive" | "warning" | "alert" | "info";
  title: string;
  body: string;
}

export interface StrideRow {
  stride: number;
  duration: number; // seconds
  hipRom: number;
  fetlockForeRom: number;
  fetlockHindRom: number;
  protractionSI: number;
}

export interface HistoryPoint {
  date: string;
  fetlockForeRom: number;
  fetlockHindRom: number;
  protractionSI: number;
  pollStability: number;
}
