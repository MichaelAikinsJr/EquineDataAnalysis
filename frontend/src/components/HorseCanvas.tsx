import { useEffect, useRef } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────
type KP = Record<string, [number, number]>;

// ─── Skeleton ─────────────────────────────────────────────────────────────────
const SKEL: [string, string, string][] = [
  ["croup",    "hip",          "#38bdf8"],
  ["hip",      "stifle",       "#4ade80"],
  ["stifle",   "hock",         "#4ade80"],
  ["hock",     "hindFetlock",  "#4ade80"],
  ["croup",    "withers",      "#38bdf8"],
  ["withers",  "shoulder",     "#38bdf8"],
  ["shoulder", "elbow",        "#fb923c"],
  ["elbow",    "knee",         "#fb923c"],
  ["knee",     "foreFetlock",  "#fb923c"],
  ["withers",  "poll",         "#c084fc"],
  ["poll",     "nose",         "#c084fc"],
];

const KP_COLORS: Record<string, string> = {
  croup: "#f43f5e",    hip: "#ef4444",       stifle: "#22c55e",
  hock: "#16a34a",     hindFetlock: "#4ade80",
  withers: "#38bdf8",  shoulder: "#0ea5e9",   elbow: "#f97316",
  knee: "#fb923c",     foreFetlock: "#fbbf24",
  poll: "#a855f7",     nose: "#c084fc",
};

// Joints that show trajectory trails (high-motion distal joints)
const TRAIL_JOINTS = new Set(["stifle","hock","hindFetlock","elbow","knee","foreFetlock"]);

// ─── Anatomical base positions (640×360 coordinate space) ─────────────────────
const BASE: KP = {
  poll:        [530, 100], nose:        [568, 130],
  withers:     [388,  88], croup:       [170, 106],
  hip:         [174, 140], stifle:      [196, 208],
  hock:        [180, 276], hindFetlock: [192, 318],
  shoulder:    [385, 125], elbow:       [400, 198],
  knee:        [390, 262], foreFetlock: [396, 310],
};

function computePhase(frame: number) {
  return (frame / 30) * Math.PI * 2 * 1.6;
}

function getKP(phase: number): KP {
  const h  = Math.sin(phase),            h2 = Math.sin(2 * phase);
  const f  = Math.sin(phase + Math.PI),  f2 = Math.sin(2 * (phase + Math.PI));
  const bob = 1.5 * Math.sin(2 * phase);
  return {
    poll:        [BASE.poll[0],        BASE.poll[1]        + bob],
    nose:        [BASE.nose[0],        BASE.nose[1]        + bob],
    withers:     [BASE.withers[0],     BASE.withers[1]     + bob],
    croup:       [BASE.croup[0],       BASE.croup[1]       + bob],
    hip:         [BASE.hip[0],         BASE.hip[1]         + bob],
    shoulder:    [BASE.shoulder[0],    BASE.shoulder[1]    + bob],
    stifle:      [BASE.stifle[0]      + 16 * h,            BASE.stifle[1]      - 6 * Math.max(0, h)],
    hock:        [BASE.hock[0]        + 10 * h - 3 * h2,   BASE.hock[1]        + 3 * h],
    hindFetlock: [BASE.hindFetlock[0] +  8 * h,            BASE.hindFetlock[1] - 9 * Math.abs(h)],
    elbow:       [BASE.elbow[0]       + 16 * f,            BASE.elbow[1]       - 6 * Math.max(0, f)],
    knee:        [BASE.knee[0]        + 10 * f - 3 * f2,   BASE.knee[1]        + 3 * f],
    foreFetlock: [BASE.foreFetlock[0] +  8 * f,            BASE.foreFetlock[1] - 9 * Math.abs(f)],
  };
}

// ─── Image cache ──────────────────────────────────────────────────────────────
let cachedImg: HTMLImageElement | null = null;

function loadImg(): Promise<HTMLImageElement> {
  return new Promise((resolve) => {
    if (cachedImg?.complete && cachedImg.naturalWidth > 0) { resolve(cachedImg); return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => { cachedImg = img; resolve(img); };
    img.onerror = () => resolve(img);
    img.src =
      "https://images.unsplash.com/photo-1553284965-83fd3e82fa5a" +
      "?w=1280&h=720&fit=crop&auto=format&q=90";
  });
}

// ─── Renderer ─────────────────────────────────────────────────────────────────
function render(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  frame: number,
  isPlaying: boolean,
) {
  const W = ctx.canvas.width, H = ctx.canvas.height;
  const phase    = computePhase(frame);
  const currentKP = getKP(phase);

  // ── Draw horse photo with subtle live camera motion ──────────────────────
  ctx.fillStyle = "#1a1f2e";
  ctx.fillRect(0, 0, W, H);

  if (img.complete && img.naturalWidth > 0) {
    // Slow horizontal tracking pan + gentle vertical breath + micro shake
    const pan  = isPlaying ?  5 * Math.sin(phase * 0.22) : 0;
    const vBob = isPlaying ?  1.8 * Math.sin(2 * phase)  : 0;
    const jx   = isPlaying ? (Math.random() - 0.5) * 1.0 : 0;
    const jy   = isPlaying ? (Math.random() - 0.5) * 0.6 : 0;
    // Very subtle zoom pulse tied to gait rhythm
    const zoom = isPlaying ? 1 + 0.006 * Math.sin(2 * phase) : 1;
    const dw = W * zoom, dh = H * zoom;
    const ox = (W - dw) / 2 + pan + jx;
    const oy = (H - dh) / 2 + vBob + jy;
    ctx.drawImage(img, ox, oy, dw, dh);
  }

  // ── Dark overlay — helps keypoints read cleanly ──────────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.20)";
  ctx.fillRect(0, 0, W, H);

  // ── Vignette ──────────────────────────────────────────────────────────────
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.18, W / 2, H / 2, H * 0.8);
  vig.addColorStop(0, "rgba(0,0,0,0)");
  vig.addColorStop(1, "rgba(0,0,0,0.36)");
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  // ── Joint trajectory trails (last 12 frames) ─────────────────────────────
  const TRAIL = 12;
  for (let i = TRAIL; i >= 1; i--) {
    const tf = Math.max(0, frame - i);
    const tkp = getKP(computePhase(tf));
    const progress = (TRAIL - i) / TRAIL; // 0=oldest → 1=newest
    const alpha  = progress * 0.55;
    const radius = 1.5 + progress * 1.5;

    Object.entries(tkp).forEach(([name, [x, y]]) => {
      if (!TRAIL_JOINTS.has(name)) return;
      const color = KP_COLORS[name] ?? "#fff";
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.shadowColor = color;
      ctx.shadowBlur  = 4;
      ctx.fillStyle   = color;
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }

  // ── Skeleton lines ────────────────────────────────────────────────────────
  SKEL.forEach(([a, b, color]) => {
    const p1 = currentKP[a], p2 = currentKP[b];
    if (!p1 || !p2) return;
    ctx.save();
    // Glow pass
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.strokeStyle = color; ctx.lineWidth  = 2.5;
    ctx.lineCap     = "round"; ctx.globalAlpha = 0.5;
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    // Bright core
    ctx.shadowBlur = 3; ctx.globalAlpha = 0.95; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.moveTo(p1[0], p1[1]); ctx.lineTo(p2[0], p2[1]); ctx.stroke();
    ctx.restore();
  });

  // ── Keypoint dots ─────────────────────────────────────────────────────────
  Object.entries(currentKP).forEach(([name, [x, y]]) => {
    const color = KP_COLORS[name] ?? "#fff";
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.fillStyle   = color; ctx.globalAlpha = 0.28;
    ctx.beginPath(); ctx.arc(x, y, 10, 0, Math.PI * 2); ctx.fill(); // outer halo
    ctx.shadowBlur = 5; ctx.globalAlpha = 0.90;
    ctx.beginPath(); ctx.arc(x, y, 5,  0, Math.PI * 2); ctx.fill(); // disc
    ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(x, y, 1.8, 0, Math.PI * 2); ctx.fill(); // white core
    ctx.restore();
  });

  // ── Scan-line texture (mimics real camera sensor) ─────────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.045)";
  for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

  // ── Top HUD bar ───────────────────────────────────────────────────────────
  const mono = `"JetBrains Mono", monospace`;
  ctx.fillStyle = "rgba(0,0,0,0.72)";
  ctx.fillRect(0, 0, W, 27);

  ctx.font = `500 11px ${mono}`;
  ctx.fillStyle = "#22d3ee";
  ctx.fillText(`FRAME ${String(frame).padStart(4, "0")}`, 12, 17.5);

  ctx.fillStyle = "#64748b";
  ctx.fillText(`${(frame / 30).toFixed(2)}s  ·  30 fps`, 110, 17.5);

  ctx.fillStyle = "#94a3b8";
  ctx.fillText("conf 0.94", W / 2 - 30, 17.5);

  // Blinking rec dot
  const blink = !isPlaying || Math.sin((frame / 30) * Math.PI * 2 * 0.75) > 0;
  ctx.fillStyle = blink ? "#4ade80" : "transparent";
  ctx.beginPath(); ctx.arc(W - 162, 13.5, 4, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4ade80";
  ctx.fillText("POSE ACTIVE", W - 152, 17.5);

  // KP badge
  ctx.fillStyle = "rgba(37,99,235,0.6)";
  roundRect(ctx, W / 2 + 55, 5, 68, 17, 3); ctx.fill();
  ctx.font = `500 9.5px ${mono}`; ctx.fillStyle = "#ffffff";
  ctx.fillText("12 / 12  KP", W / 2 + 63, 16.5);

  // ── Bottom HUD bar ─────────────────────────────────────────────────────────
  ctx.fillStyle = "rgba(0,0,0,0.70)";
  ctx.fillRect(0, H - 22, W, 22);
  ctx.font = `9.5px ${mono}`; ctx.fillStyle = "#475569";
  ctx.fillText(
    "YOLO-Pose v8  ·  12/12 KP  ·  EGA v2.4  ·  Vanguard  ·  Trot  ·  trajectory trail ON",
    10, H - 7,
  );

  // Progress bar along bottom edge
  ctx.fillStyle = "rgba(255,255,255,0.10)";
  ctx.fillRect(0, H - 22, W, 2);
  ctx.fillStyle = "#2563eb";
  ctx.fillRect(0, H - 22, W * (frame / 149), 2);
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ─── Component ────────────────────────────────────────────────────────────────

interface HorseCanvasProps {
  currentFrame: number;
  isPlaying:    boolean;
}

export default function HorseCanvas({ currentFrame, isPlaying }: HorseCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef    = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    loadImg().then((img) => { imgRef.current = img; });
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (imgRef.current) {
      render(ctx, imgRef.current, currentFrame, isPlaying);
    } else {
      loadImg().then((img) => {
        imgRef.current = img;
        render(ctx, img, currentFrame, isPlaying);
      });
    }
  }, [currentFrame, isPlaying]);

  return (
    <canvas
      ref={canvasRef}
      width={640}
      height={360}
      className="w-full h-auto block"
    />
  );
}
