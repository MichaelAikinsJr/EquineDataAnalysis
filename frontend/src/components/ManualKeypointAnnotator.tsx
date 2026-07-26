import React, { useMemo, useRef, useState } from 'react';

export type Keypoint2D = { x: number; y: number } | null;

interface Props {
  imageUrl: string;
  pointNames: string[];
  onSubmit: (payload: { start_frame: number; keypoints_norm: Keypoint2D[] }) => void;
  startFrame: number;
  width?: number;
  height?: number;
}

export function ManualKeypointAnnotator({
  imageUrl,
  pointNames,
  onSubmit,
  startFrame,
  width = 960,
  height = 540,
}: Props) {
  const [points, setPoints] = useState<Keypoint2D[]>(Array(pointNames.length).fill(null));
  const [currentIndex, setCurrentIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const currentName = useMemo(() => pointNames[currentIndex] ?? 'Complete', [pointNames, currentIndex]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (currentIndex >= pointNames.length) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const next = [...points];
    next[currentIndex] = { x, y };
    setPoints(next);
    setCurrentIndex((prev) => Math.min(prev + 1, pointNames.length));
  };

  const undo = () => {
    const idx = Math.max(0, currentIndex - 1);
    const next = [...points];
    next[idx] = null;
    setPoints(next);
    setCurrentIndex(idx);
  };

  const reset = () => {
    setPoints(Array(pointNames.length).fill(null));
    setCurrentIndex(0);
  };

  const submit = () => {
    if (points.some((p) => p === null)) {
      alert('Please place all keypoints before submitting.');
      return;
    }
    onSubmit({ start_frame: startFrame, keypoints_norm: points });
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4">
        <div className="mb-2 font-medium">Current point: {currentName}</div>
        <div className="text-sm text-gray-600">Click the landmarks in the required anatomical order.</div>
      </div>

      <div
        ref={containerRef}
        className="relative cursor-crosshair overflow-hidden rounded-lg border bg-black"
        style={{ width, height }}
        onClick={handleClick}
      >
        <img src={imageUrl} alt="Annotation frame" className="absolute inset-0 h-full w-full object-contain" />
        {points.map((p, idx) =>
          p ? (
            <div
              key={idx}
              className="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              title={`${idx + 1}. ${pointNames[idx]}`}
            >
              <span className="absolute left-5 top-0 rounded bg-white px-1 text-xs text-black">{idx + 1}</span>
            </div>
          ) : null
        )}
      </div>

      <div className="flex gap-2">
        <button className="rounded bg-gray-200 px-3 py-2" onClick={undo}>Undo</button>
        <button className="rounded bg-gray-200 px-3 py-2" onClick={reset}>Reset</button>
        <button className="rounded bg-teal-700 px-3 py-2 text-white" onClick={submit}>Start classical tracking</button>
      </div>

      <div className="grid grid-cols-2 gap-2 rounded-lg border p-4 text-sm md:grid-cols-3">
        {pointNames.map((name, idx) => (
          <div key={name} className={points[idx] ? 'text-green-700' : 'text-gray-500'}>
            {idx + 1}. {name}
          </div>
        ))}
      </div>
    </div>
  );
}
