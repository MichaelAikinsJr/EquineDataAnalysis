// Horse keypoint positions (base coords in a 640×360 canvas space)
export const SKEL: [string, string, string][] = [
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

export const KP_COLORS: Record<string, string> = {
  croup:       "#f43f5e",
  hip:         "#ef4444",
  stifle:      "#22c55e",
  hock:        "#16a34a",
  hindFetlock: "#4ade80",
  withers:     "#38bdf8",
  shoulder:    "#0ea5e9",
  elbow:       "#f97316",
  knee:        "#fb923c",
  foreFetlock: "#fbbf24",
  poll:        "#a855f7",
  nose:        "#c084fc",
};

export function computeKeypoints(phase: number): Record<string, [number, number]> {
  const h  = Math.sin(phase);
  const h2 = Math.sin(2 * phase);
  const f  = Math.sin(phase + Math.PI);
  const f2 = Math.sin(2 * (phase + Math.PI));
  return {
    croup:       [200, 148],
    hip:         [205, 172],
    stifle:      [215 + 22 * h,           215 - 8  * Math.max(0, h)],
    hock:        [200 + 14 * h - 6 * h2,  268 + 4  * h],
    hindFetlock: [205 + 10 * h,           305 - 10 * Math.abs(h)],
    withers:     [370, 136],
    shoulder:    [368, 162],
    elbow:       [382 + 22 * f,           208 - 8  * Math.max(0, f)],
    knee:        [372 + 14 * f - 6 * f2,  258 + 4  * f],
    foreFetlock: [375 + 10 * f,           298 - 10 * Math.abs(f)],
    poll:        [520, 112],
    nose:        [555, 136],
  };
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  phase: number,
  frame: number,
) {
  const scale = W / 640;
  const S = (x: number) => x * scale;

  // Background
  ctx.fillStyle = "#0b0f1c";
  ctx.fillRect(0, 0, W, H);

  // Vignette
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.15, W / 2, H / 2, H * 0.85);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);

  // Horse silhouette
  ctx.globalAlpha = 0.11;
  ctx.fillStyle = "#d1d5db";
  ctx.beginPath(); ctx.ellipse(S(305), S(178), S(128), S(52),  0.04, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(S(212), S(163), S(52),  S(40), -0.08, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.ellipse(S(400), S(174), S(42),  S(36),  0.10, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(S(438), S(148)); ctx.rotate(-0.38);
  ctx.beginPath(); ctx.ellipse(0, 0, S(48), S(20), 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.beginPath(); ctx.ellipse(S(512), S(120), S(42), S(27), 0.18, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1.0;

  const kp = computeKeypoints(phase);

  // Skeleton lines
  SKEL.forEach(([a, b, color]) => {
    const p1 = kp[a], p2 = kp[b];
    if (!p1 || !p2) return;
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8 * scale;
    ctx.beginPath();
    ctx.moveTo(p1[0] * scale, p1[1] * scale);
    ctx.lineTo(p2[0] * scale, p2[1] * scale);
    ctx.stroke();
    ctx.restore();
  });

  // Keypoint dots
  Object.entries(kp).forEach(([name, [x, y]]) => {
    const color = KP_COLORS[name] ?? "#fff";
    ctx.save();
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x * scale, y * scale, 5.5 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#ffffff";
    ctx.beginPath(); ctx.arc(x * scale, y * scale, 2 * scale, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  });

  // Top HUD bar
  ctx.fillStyle = "rgba(0,0,0,0.65)";
  ctx.fillRect(0, 0, W, S(26));
  ctx.font = `${S(11)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = "#22d3ee";
  ctx.fillText(`FRAME ${String(frame).padStart(4, "0")}`, S(12), S(17));
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(`${(frame / 30).toFixed(2)}s  ·  30 fps`, S(110), S(17));
  ctx.fillStyle = "#4ade80";
  ctx.beginPath(); ctx.arc(W - S(173), S(13), S(3.5), 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#4ade80";
  ctx.fillText("POSE ACTIVE", W - S(163), S(17));

  // Bottom HUD bar
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, H - S(22), W, S(22));
  ctx.font = `${S(9.5)}px "JetBrains Mono", monospace`;
  ctx.fillStyle = "#475569";
  ctx.fillText("YOLO-Pose v8  ·  12/12 KP detected  ·  conf 0.94  ·  EGA v2.4", S(10), H - S(7));
}
