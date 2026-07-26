import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "./Layout";
import api from "../api";

type MarkerPoint = {
  name: string;
  point: [number, number] | null; // normalized [0..1, 0..1]
  visible: boolean;
  original_index?: number | null;
};

type KeyframeAnnotation = {
  frame_index: number;
  selected_keypoints: MarkerPoint[];
};

type MetadataResponse = {
  session_id: string;
  fps: number;
  total_frames: number;
  width: number;
  height: number;
  marker_names: string[];
  saved_keyframes: any[];
};

export default function ClassicalMarkersSetup() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [fps, setFps] = useState(0);
  const [totalFrames, setTotalFrames] = useState(0);
  const [videoWidth, setVideoWidth] = useState(0);
  const [videoHeight, setVideoHeight] = useState(0);
  const [markerNames, setMarkerNames] = useState<string[]>([]);

  const [frameInput, setFrameInput] = useState(0);
  const [selectedFrames, setSelectedFrames] = useState<number[]>([]);
  const [activeFrame, setActiveFrame] = useState<number | null>(null);
  const [frameImage, setFrameImage] = useState<string>("");

  const [annotations, setAnnotations] = useState<Record<number, KeyframeAnnotation>>({});
  const [activePointName, setActivePointName] = useState("");
  const [hasSavedSetup, setHasSavedSetup] = useState(false);

  const getErrorMessage = useCallback((err: any) => {
    const data = err?.response?.data;

    if (!data) return "Request failed.";
    if (typeof data.detail === "string") return data.detail;
    if (typeof data === "string") return data;
    if (Array.isArray(data)) return data.join(", ");

    if (typeof data === "object") {
      return Object.entries(data)
        .map(([key, value]) => {
          if (Array.isArray(value)) return `${key}: ${value.join(", ")}`;
          if (typeof value === "string") return `${key}: ${value}`;
          return `${key}: ${JSON.stringify(value)}`;
        })
        .join(" | ");
    }

    return "Request failed.";
  }, []);

  const normalizePointsForOrder = useCallback((points: MarkerPoint[], order: string[]) => {
    const orderMap = new Map(order.map((name, idx) => [name, idx]));
    return [...points].sort((a, b) => {
      const aIdx = orderMap.get(a.name);
      const bIdx = orderMap.get(b.name);
      const safeA = aIdx === undefined ? Number.MAX_SAFE_INTEGER : aIdx;
      const safeB = bIdx === undefined ? Number.MAX_SAFE_INTEGER : bIdx;
      return safeA - safeB;
    });
  }, []);

  const markDirty = useCallback(() => {
    setHasSavedSetup(false);
    setSuccess("");
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        setSuccess("");

        const res = await api.get<MetadataResponse>(
          `/api/sessions/${sessionId}/markers/setup/metadata/`
        );
        const data = res.data;

        setFps(data.fps);
        setTotalFrames(data.total_frames);
        setVideoWidth(data.width);
        setVideoHeight(data.height);
        setMarkerNames(data.marker_names);

        const savedFrames = Array.isArray(data.saved_keyframes)
          ? data.saved_keyframes
              .map((item: any) => item?.frameindex ?? item?.frame_index)
              .filter((v: any) => typeof v === "number")
              .sort((a: number, b: number) => a - b)
          : [];

        setSelectedFrames(savedFrames);

        if (Array.isArray(data.saved_keyframes) && data.saved_keyframes.length > 0) {
          const restored: Record<number, KeyframeAnnotation> = {};

          for (const item of data.saved_keyframes) {
            const frameIndex = item.frameindex ?? item.frame_index;
            const backendPoints = Array.isArray(item.selectedkeypoints)
              ? item.selectedkeypoints
              : Array.isArray(item.selected_keypoints)
              ? item.selected_keypoints
              : [];

            const restoredPoints: MarkerPoint[] = normalizePointsForOrder(
              data.marker_names.map((name, idx) => {
                const found = backendPoints.find((kp: any) => kp.name === name);
                if (found && Array.isArray(found.point) && found.point.length === 2) {
                  return {
                    name,
                    point: [Number(found.point[0]), Number(found.point[1])],
                    visible: true,
                    original_index: found.original_index ?? idx,
                  };
                }
                return {
                  name,
                  point: null,
                  visible: true,
                  original_index: idx,
                };
              }),
              data.marker_names
            );

            restored[frameIndex] = {
              frame_index: frameIndex,
              selected_keypoints: restoredPoints,
            };
          }

          setAnnotations(restored);
          setFrameInput(savedFrames[0] ?? 0);
          setHasSavedSetup(true);
        } else {
          setFrameInput(0);
          setHasSavedSetup(false);
        }

        setActivePointName(data.marker_names[0] || "");
      } catch (err: any) {
        setError(getErrorMessage(err) || "Could not load marker setup.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [sessionId, getErrorMessage, normalizePointsForOrder]);

  const blankKeypoints = useMemo(
    () =>
      markerNames.map((name, idx) => ({
        name,
        point: null as [number, number] | null,
        visible: true,
        original_index: idx,
      })),
    [markerNames]
  );

  const activeAnnotation = activeFrame != null ? annotations[activeFrame] : null;
  const currentPoints = activeAnnotation?.selected_keypoints ?? [];
  const selectedNames = currentPoints.filter((p) => p.point).map((p) => p.name);
  const currentFrameHasSavedKeyframe =
    activeFrame != null && selectedFrames.includes(activeFrame);

  useEffect(() => {
    if (!activeAnnotation || markerNames.length === 0) {
      setActivePointName(markerNames[0] || "");
      return;
    }

    const nextUnselected =
      markerNames.find((name) => {
        const match = activeAnnotation.selected_keypoints.find((p) => p.name === name);
        return !match?.point;
      }) || "";

    setActivePointName(nextUnselected || markerNames[0] || "");
  }, [activeFrame, activeAnnotation, markerNames]);

  const loadFrame = async (frameIndex: number) => {
    try {
      setError("");
      setSuccess("");

      const res = await api.get(
        `/api/sessions/${sessionId}/markers/setup/frame/?frame=${frameIndex}`
      );
      const data = res.data;

      setActiveFrame(frameIndex);
      setFrameImage(`data:${data.mime_type};base64,${data.image_base64}`);

      setAnnotations((prev) => {
        if (prev[frameIndex]) return prev;
        return {
          ...prev,
          [frameIndex]: {
            frame_index: frameIndex,
            selected_keypoints: blankKeypoints.map((kp) => ({ ...kp })),
          },
        };
      });
    } catch (err: any) {
      setError(getErrorMessage(err) || "Could not load frame.");
    }
  };

  const addFrame = async () => {
    if (frameInput < 0 || frameInput >= totalFrames) {
      setError("Frame is out of range.");
      return;
    }

    setError("");
    setSuccess("");

    const next = Array.from(new Set([...selectedFrames, frameInput])).sort((a, b) => a - b);
    setSelectedFrames(next);
    markDirty();
    await loadFrame(frameInput);
  };

  const removeFrame = (frameIndex: number) => {
    setSelectedFrames((prev) => prev.filter((f) => f !== frameIndex));

    setAnnotations((prev) => {
      const next = { ...prev };
      delete next[frameIndex];
      return next;
    });

    if (activeFrame === frameIndex) {
      setActiveFrame(null);
      setFrameImage("");
    }

    markDirty();
    setError("");
  };

  const resetActiveFrameAnnotations = () => {
    if (activeFrame == null) return;

    setAnnotations((prev) => ({
      ...prev,
      [activeFrame]: {
        frame_index: activeFrame,
        selected_keypoints: blankKeypoints.map((kp) => ({ ...kp })),
      },
    }));

    setActivePointName(markerNames[0] || "");
    markDirty();
    setError("");
  };

  const handleImageClick = (event: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    if (!img || activeFrame == null) return;

    if (!activePointName) {
      setError("Select a marker name before clicking on the image.");
      return;
    }

    const rect = img.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const xNorm = Math.max(0, Math.min(1, x / rect.width));
    const yNorm = Math.max(0, Math.min(1, y / rect.height));

    setAnnotations((prev) => {
      const frame = prev[activeFrame];
      if (!frame) return prev;

      const updated = frame.selected_keypoints.map((kp) =>
        kp.name === activePointName
          ? {
              ...kp,
              point: [Number(xNorm.toFixed(6)), Number(yNorm.toFixed(6))],
              visible: true,
            }
          : kp
      );

      return {
        ...prev,
        [activeFrame]: {
          ...frame,
          selected_keypoints: normalizePointsForOrder(updated, markerNames),
        },
      };
    });

    const nextActive =
      markerNames.find((name) => {
        const match =
          name === activePointName
            ? { point: [xNorm, yNorm] }
            : currentPoints.find((p) => p.name === name);
        return !match?.point;
      }) || "";

    setActivePointName(nextActive || "");
    markDirty();
    setError("");
  };

  const removePoint = (name: string) => {
    if (activeFrame == null) return;

    setAnnotations((prev) => {
      const frame = prev[activeFrame];
      if (!frame) return prev;

      const updated = frame.selected_keypoints.map((kp) =>
        kp.name === name ? { ...kp, point: null, visible: true } : kp
      );

      return {
        ...prev,
        [activeFrame]: {
          ...frame,
          selected_keypoints: updated,
        },
      };
    });

    setActivePointName(name);
    markDirty();
    setError("");
  };

  const saveCurrentFrameAsKeyframe = () => {
    if (activeFrame == null) {
      setError("Load a frame first.");
      return;
    }

    const ann = annotations[activeFrame];
    if (!ann) {
      setError("No annotation data for this frame.");
      return;
    }

    const hasAtLeastOnePoint = ann.selected_keypoints.some((kp) => !!kp.point);
    if (!hasAtLeastOnePoint) {
      setError("Place at least one point before saving this frame as a keyframe.");
      return;
    }

    if (!selectedFrames.includes(activeFrame)) {
      setSelectedFrames((prev) => [...prev, activeFrame].sort((a, b) => a - b));
    }

    const remaining = markerNames.find((name) => {
      const point = ann.selected_keypoints.find((p) => p.name === name);
      return !point?.point;
    });

    setActivePointName(remaining || "");
    markDirty();
    setError("");
  };

  const validateBeforeSave = () => {
    if (selectedFrames.length < 2) {
      return "Select at least two keyframes.";
    }

    for (const frameIndex of selectedFrames) {
      const ann = annotations[frameIndex];
      if (!ann) {
        return `Frame ${frameIndex} has no annotation data.`;
      }

      for (const kp of ann.selected_keypoints) {
        if (!kp.visible || !kp.point) {
          return `Frame ${frameIndex}: marker "${kp.name}" must be placed before saving.`;
        }
      }
    }

    return "";
  };

  const saveSetup = async () => {
    const validationMessage = validateBeforeSave();
    if (validationMessage) {
      setError(validationMessage);
      throw new Error(validationMessage);
    }

    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const payload = {
        manual_keyframes: selectedFrames
          .map((frameIndex) => annotations[frameIndex])
          .filter(Boolean)
          .map((ann) => ({
            frame_index: ann.frame_index,
            selected_keypoints: ann.selected_keypoints.map((kp) => ({
              name: kp.name,
              point: kp.point, // normalized
              original_index: kp.original_index ?? markerNames.indexOf(kp.name),
            })),
          })),
      };

      await api.post(`/api/sessions/${sessionId}/markers/setup/save/`, payload);
      setHasSavedSetup(true);
      setSuccess("Marker setup saved.");
    } catch (err: any) {
      setError(getErrorMessage(err) || "Could not save marker setup.");
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const startTracking = async () => {
    try {
      setStarting(true);
      setError("");
      setSuccess("");

      await saveSetup();
      await api.post(`/api/sessions/${sessionId}/markers/setup/start/`);
      navigate(`/processing/${sessionId}`);
    } catch (err: any) {
      setError(getErrorMessage(err) || "Could not start marker tracking.");
    } finally {
      setStarting(false);
    }
  };

  if (loading) {
    return (
      <Layout current="upload">
        <div className="max-w-5xl mx-auto px-6 py-8">Loading marker setup…</div>
      </Layout>
    );
  }

  return (
    <Layout current="upload">
      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-6">
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-semibold">Classical markers setup</h1>
              <p className="text-sm text-slate-400 mt-1">
                Frame {activeFrame ?? "-"}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <input
                type="number"
                min={0}
                max={Math.max(totalFrames - 1, 0)}
                value={frameInput}
                onChange={(e) => setFrameInput(Number(e.target.value))}
                className="w-28 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
              />
              <button
                onClick={addFrame}
                className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600"
                type="button"
              >
                Add frame
              </button>
            </div>
          </div>

          <div className="mb-4 text-sm text-slate-400">
            Total frames: {totalFrames || "unknown"} | FPS: {fps || "unknown"} | Width: {videoWidth} | Height: {videoHeight}
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-700 bg-red-950/40 px-4 py-3 text-red-300">
              {error}
            </div>
          ) : null}

          {success ? (
            <div className="mb-4 rounded-xl border border-emerald-700 bg-emerald-950/30 px-4 py-3 text-emerald-300">
              {success}
            </div>
          ) : null}

          <div className="mb-4 flex flex-wrap gap-2">
            {selectedFrames.map((f) => (
              <div key={f} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => loadFrame(f)}
                  className={`px-3 py-1.5 rounded-md border text-sm ${
                    activeFrame === f
                      ? "border-emerald-500 bg-emerald-500/10 text-emerald-300"
                      : "border-slate-700 bg-slate-950 text-slate-200"
                  }`}
                >
                  Frame {f}
                </button>

                <button
                  type="button"
                  onClick={() => removeFrame(f)}
                  className="px-2 py-1.5 rounded-md border border-red-700 text-red-300 text-sm"
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-[26px] border border-[#415273] bg-black">
            {frameImage ? (
              <div className="p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-sm text-slate-300">
                    Next point:{" "}
                    <span className="font-medium text-emerald-400">
                      {activePointName || "Complete"}
                    </span>
                  </div>

                  <div className="text-xs text-slate-400">
                    {currentFrameHasSavedKeyframe
                      ? "Editing saved keyframe for this frame"
                      : "This frame is not saved yet"}
                  </div>
                </div>

                <div className="relative inline-block align-top">
                  <img
                    ref={imgRef}
                    src={frameImage}
                    alt="Classical setup frame"
                    onClick={handleImageClick}
                    className="block max-w-full h-auto cursor-crosshair select-none rounded-xl"
                    draggable={false}
                  />

                  <div className="absolute inset-0 pointer-events-none">
                    {currentPoints
                      .filter((kp) => kp.point)
                      .map((kp, idx) => (
                        <div
                          key={`${activeFrame}-${kp.name}`}
                          className="absolute"
                          style={{
                            left: `${kp.point![0] * 100}%`,
                            top: `${kp.point![1] * 100}%`,
                            transform: "translate(-50%, -50%)",
                          }}
                        >
                          <div className="h-2.5 w-2.5 rounded-full border border-white bg-emerald-400 shadow" />
                          <div className="absolute left-1/2 top-[13px] -translate-x-1/2 rounded-md border border-slate-700 bg-slate-950/85 px-1.5 py-[2px] text-[10px] leading-none text-slate-200 whitespace-nowrap">
                            {idx + 1}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-10 text-slate-400">No frame loaded.</div>
            )}
          </div>
        </section>

        <aside className="bg-slate-900 border border-slate-800 rounded-2xl p-4 text-white">
          <h2 className="text-xl font-semibold mb-4">Manual keyframe setup</h2>

          <div className="mb-5">
            <label className="block text-sm text-slate-300 mb-2">
              Active keypoint to place
            </label>
            <select
              value={activePointName}
              onChange={(e) => setActivePointName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
            >
              <option value="">Select a keypoint</option>
              {markerNames.map((name) => (
                <option key={name} value={name}>
                  {name}
                  {selectedNames.includes(name) ? " (placed on this frame)" : ""}
                </option>
              ))}
            </select>
            <p className="text-xs text-slate-400 mt-2">
              Points are edited per frame. Load another frame to create the next keyframe.
            </p>
          </div>

          <div className="mb-5 space-y-2">
            <button
              type="button"
              onClick={saveCurrentFrameAsKeyframe}
              className="w-full px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-medium"
            >
              {currentFrameHasSavedKeyframe ? "Update this keyframe" : "Save current frame as keyframe"}
            </button>

            <button
              type="button"
              onClick={resetActiveFrameAnnotations}
              className="w-full px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700"
              disabled={activeFrame == null}
            >
              Clear current frame points
            </button>

            <button
              type="button"
              onClick={() => activeFrame != null && removeFrame(activeFrame)}
              disabled={activeFrame == null}
              className="w-full px-4 py-2 rounded-xl bg-red-900/50 hover:bg-red-800/60 disabled:opacity-50 disabled:cursor-not-allowed text-red-100"
            >
              Remove current keyframe
            </button>
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-200">Points on current frame</h3>
              <span className="text-xs text-slate-400">
                {currentPoints.filter((kp) => kp.point).length} placed
              </span>
            </div>

            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              {currentPoints.filter((kp) => kp.point).length === 0 ? (
                <div className="text-sm text-slate-400">No points placed on this frame.</div>
              ) : (
                currentPoints
                  .filter((kp) => kp.point)
                  .map((kp, idx) => (
                    <div
                      key={`${activeFrame}-${kp.name}`}
                      className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950 px-3 py-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-emerald-500/15 px-1.5 text-[11px] font-medium text-emerald-300 border border-emerald-500/20">
                            {idx + 1}
                          </span>
                          <div className="text-sm font-medium truncate">{kp.name}</div>
                        </div>
                        <div className="mt-1 text-xs text-slate-400">
                          x={kp.point![0].toFixed(4)}, y={kp.point![1].toFixed(4)}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => removePoint(kp.name)}
                        className="ml-3 text-xs px-2 py-1 rounded bg-red-900/50 hover:bg-red-800/60 text-red-200 shrink-0"
                      >
                        Remove
                      </button>
                    </div>
                  ))
              )}
            </div>
          </div>

          <div className="mb-5">
            <h3 className="text-sm font-medium text-slate-200 mb-2">Saved keyframes</h3>
            <div className="space-y-2 max-h-52 overflow-auto pr-1">
              {selectedFrames.length === 0 ? (
                <div className="text-sm text-slate-400">No saved keyframes yet.</div>
              ) : (
                selectedFrames.map((frame, idx) => {
                  const count =
                    annotations[frame]?.selected_keypoints.filter((kp) => kp.point).length ?? 0;

                  return (
                    <button
                      key={frame}
                      type="button"
                      onClick={() => loadFrame(frame)}
                      className={`w-full text-left rounded-xl border px-3 py-2 ${
                        frame === activeFrame
                          ? "border-emerald-500 bg-emerald-500/10"
                          : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-medium text-slate-200">
                          Keyframe {idx + 1}
                        </div>
                        <div className="text-xs text-slate-400">
                          Frame {frame}
                        </div>
                      </div>
                      <div className="mt-1 text-xs text-slate-400">
                        {count} keypoints
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={saveSetup}
              disabled={saving || selectedFrames.length < 2}
              className="w-full px-4 py-3 rounded-xl bg-sky-700 hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {saving ? "Saving setup..." : "Save setup"}
            </button>

            <button
              type="button"
              onClick={startTracking}
              disabled={starting || saving || selectedFrames.length < 2}
              className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {starting ? "Starting marker tracking..." : "Start marker tracking"}
            </button>

            <button
              type="button"
              onClick={() => navigate(-1)}
              className="w-full px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700"
            >
              Back
            </button>
          </div>
        </aside>
      </div>
    </Layout>
  );
}