import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import api from "../api";

type SelectedKeypoint = {
  name: string;
  point: [number, number];
  original_index?: number | null;
};

type KeyframeAnnotation = {
  frame_index: number;
  selected_keypoints: SelectedKeypoint[];
};

type ClassicalSetupResponse = {
  session_id: string;
  horse_id: string | null;
  horse_name: string | null;
  gait: string | null;
  tracking_mode: string;
  status: string;
  progress: number;
  current_step: string | null;
  manual_start_frame: number | null;
  manual_keypoints_norm: SelectedKeypoint[];
  manual_keyframes_norm?: KeyframeAnnotation[];
  fps: number | null;
  total_frames: number | null;
  original_filename: string | null;
  default_keypoints: string[];
};

const ClassicalSetupPage: React.FC = () => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const imgRef = useRef<HTMLImageElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const latestRequestIdRef = useRef(0);
  const latestSetupRequestIdRef = useRef(0);
  const hasFetchedSetupRef = useRef<string | null>(null);

  const [setup, setSetup] = useState<ClassicalSetupResponse | null>(null);
  const [pendingFrameIndex, setPendingFrameIndex] = useState<number>(0);
  const [loadedFrameIndex, setLoadedFrameIndex] = useState<number>(0);
  const [frameUrl, setFrameUrl] = useState<string>("");

  const [keyframes, setKeyframes] = useState<KeyframeAnnotation[]>([]);
  const [activePointName, setActivePointName] = useState<string>("");

  const [loadingSetup, setLoadingSetup] = useState<boolean>(true);
  const [loadingFrame, setLoadingFrame] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string>("");

  const revokeObjectUrl = useCallback(() => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const totalFramesKnown =
    typeof setup?.total_frames === "number" && setup.total_frames > 0;
  const maxKnownFrame = totalFramesKnown ? (setup!.total_frames as number) - 1 : null;

  const clampFrameIfKnown = useCallback(
    (value: number) => {
      if (maxKnownFrame === null) return Math.max(0, value);
      return Math.max(0, Math.min(maxKnownFrame, value));
    },
    [maxKnownFrame]
  );

  const defaultKeypoints = setup?.default_keypoints ?? [];

  const normalizePointsForOrder = useCallback(
    (points: SelectedKeypoint[], order: string[]) => {
      const orderMap = new Map(order.map((name, idx) => [name, idx]));
      return [...points].sort((a, b) => {
        const aIdx = orderMap.get(a.name);
        const bIdx = orderMap.get(b.name);
        const safeA = aIdx === undefined ? Number.MAX_SAFE_INTEGER : aIdx;
        const safeB = bIdx === undefined ? Number.MAX_SAFE_INTEGER : bIdx;
        return safeA - safeB;
      });
    },
    []
  );

  const currentKeyframe = useMemo(
    () => keyframes.find((kf) => kf.frame_index === loadedFrameIndex) || null,
    [keyframes, loadedFrameIndex]
  );

  const currentPoints = currentKeyframe?.selected_keypoints ?? [];
  const selectedNames = currentPoints.map((p) => p.name);

  const savedKeyframes = useMemo(
    () => keyframes.filter((kf) => kf.selected_keypoints.length > 0),
    [keyframes]
  );

  const canonicalLabelOrder = useMemo(() => {
    const firstNonEmpty = savedKeyframes[0]?.selected_keypoints ?? [];
    if (firstNonEmpty.length > 0) {
      return firstNonEmpty.map((p) => p.name);
    }
    return defaultKeypoints;
  }, [savedKeyframes, defaultKeypoints]);

  const sortPoints = useCallback(
    (points: SelectedKeypoint[]) =>
      normalizePointsForOrder(points, defaultKeypoints),
    [normalizePointsForOrder, defaultKeypoints]
  );

  const sortPointsCanonical = useCallback(
    (points: SelectedKeypoint[]) =>
      normalizePointsForOrder(points, canonicalLabelOrder),
    [normalizePointsForOrder, canonicalLabelOrder]
  );

  const upsertKeyframe = useCallback(
    (frameIndex: number, points: SelectedKeypoint[]) => {
      const normalized = sortPoints(points);
      setKeyframes((prev) => {
        const exists = prev.some((kf) => kf.frame_index === frameIndex);
        const next = exists
          ? prev.map((kf) =>
              kf.frame_index === frameIndex
                ? { ...kf, selected_keypoints: normalized }
                : kf
            )
          : [...prev, { frame_index: frameIndex, selected_keypoints: normalized }];

        return next.sort((a, b) => a.frame_index - b.frame_index);
      });
    },
    [sortPoints]
  );

  const removeCurrentKeyframe = useCallback(() => {
    setKeyframes((prev) => prev.filter((kf) => kf.frame_index !== loadedFrameIndex));
    setError("");
  }, [loadedFrameIndex]);

  const clearCurrentFramePoints = useCallback(() => {
    setKeyframes((prev) => {
      const exists = prev.some((kf) => kf.frame_index === loadedFrameIndex);
      if (!exists) return prev;
      return prev.map((kf) =>
        kf.frame_index === loadedFrameIndex
          ? { ...kf, selected_keypoints: [] }
          : kf
      );
    });
    setActivePointName(defaultKeypoints[0] || "");
    setError("");
  }, [loadedFrameIndex, defaultKeypoints]);

  const fetchFrameInternal = useCallback(
    async (targetFrame: number, sid?: string) => {
      const useSessionId = sid || sessionId;
      if (!useSessionId) return;

      const requestId = ++latestRequestIdRef.current;
      setLoadingFrame(true);
      setError("");

      try {
        const res = await api.get(
          `/api/sessions/${useSessionId}/classical-frame/`,
          {
            params: { frame: targetFrame },
            responseType: "blob",
          }
        );

        if (requestId !== latestRequestIdRef.current) return;

        revokeObjectUrl();

        const blob = new Blob([res.data], { type: "image/jpeg" });
        const url = URL.createObjectURL(blob);
        objectUrlRef.current = url;
        setFrameUrl(url);

        const headerFrameIndex = Number(res.headers["x-frame-index"]);
        const headerTotalFrames = Number(res.headers["x-total-frames"]);
        const headerFps = Number(res.headers["x-fps"]);

        const resolvedFrameIndex = Number.isNaN(headerFrameIndex)
          ? targetFrame
          : headerFrameIndex;

        setLoadedFrameIndex(resolvedFrameIndex);
        setPendingFrameIndex(resolvedFrameIndex);

        setSetup((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            total_frames:
              !Number.isNaN(headerTotalFrames) && headerTotalFrames > 0
                ? headerTotalFrames
                : prev.total_frames,
            fps:
              !Number.isNaN(headerFps) && headerFps > 0
                ? headerFps
                : prev.fps,
          };
        });
      } catch (err: any) {
        console.error(err);
        if (requestId !== latestRequestIdRef.current) return;
        setError(err?.response?.data?.detail || "Failed to load preview frame.");
      } finally {
        if (requestId === latestRequestIdRef.current) {
          setLoadingFrame(false);
        }
      }
    },
    [sessionId, revokeObjectUrl]
  );

  const fetchSetup = useCallback(async () => {
    if (!sessionId) return;

    const requestId = ++latestSetupRequestIdRef.current;
    setLoadingSetup(true);
    setError("");

    try {
      const res = await api.get<ClassicalSetupResponse>(
        `/api/sessions/${sessionId}/classical-setup/`
      );

      if (requestId !== latestSetupRequestIdRef.current) return;

      const data = res.data;
      setSetup(data);

      const initialFrame = data.manual_start_frame ?? 0;
      setPendingFrameIndex(initialFrame);

      const setupDefaultKeypoints = data.default_keypoints ?? [];

      const serverKeyframes =
        Array.isArray(data.manual_keyframes_norm) && data.manual_keyframes_norm.length > 0
          ? data.manual_keyframes_norm
          : data.manual_keypoints_norm?.length
          ? [
              {
                frame_index: data.manual_start_frame ?? 0,
                selected_keypoints: data.manual_keypoints_norm,
              },
            ]
          : [];

      setKeyframes(
        [...serverKeyframes]
          .map((kf) => ({
            ...kf,
            selected_keypoints: normalizePointsForOrder(
              kf.selected_keypoints,
              setupDefaultKeypoints
            ),
          }))
          .sort((a, b) => a.frame_index - b.frame_index)
      );

      await fetchFrameInternal(initialFrame, sessionId);
    } catch (err: any) {
      console.error(err);
      if (requestId !== latestSetupRequestIdRef.current) return;
      setError(
        err?.response?.data?.detail || "Failed to load classical setup session."
      );
    } finally {
      if (requestId === latestSetupRequestIdRef.current) {
        setLoadingSetup(false);
      }
    }
  }, [sessionId, fetchFrameInternal, normalizePointsForOrder]);

  const fetchFrame = useCallback(
    async (targetFrame: number) => {
      await fetchFrameInternal(targetFrame);
    },
    [fetchFrameInternal]
  );

  useEffect(() => {
    if (!sessionId) return;

    if (hasFetchedSetupRef.current === sessionId) return;
    hasFetchedSetupRef.current = sessionId;

    fetchSetup();

    return () => {
      revokeObjectUrl();
    };
  }, [sessionId, fetchSetup, revokeObjectUrl]);

  useEffect(() => {
    return () => {
      latestRequestIdRef.current += 1;
      latestSetupRequestIdRef.current += 1;
    };
  }, []);

  useEffect(() => {
    const frameEntry = keyframes.find((kf) => kf.frame_index === loadedFrameIndex);
    const framePoints = frameEntry?.selected_keypoints ?? [];
    const frameSelectedNames = framePoints.map((p) => p.name);

    const nextUnselected =
      defaultKeypoints.find((name) => !frameSelectedNames.includes(name)) || "";

    setActivePointName(nextUnselected || defaultKeypoints[0] || "");
  }, [loadedFrameIndex, keyframes, defaultKeypoints]);

  const handleImageClick = (event: React.MouseEvent<HTMLImageElement>) => {
    const img = imgRef.current;
    if (!img) return;

    if (!activePointName) {
      setError("Select a keypoint name before clicking on the image.");
      return;
    }

    const rect = img.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const xNorm = Math.max(0, Math.min(1, x / rect.width));
    const yNorm = Math.max(0, Math.min(1, y / rect.height));

    const nextPoint: SelectedKeypoint = {
      name: activePointName,
      point: [Number(xNorm.toFixed(6)), Number(yNorm.toFixed(6))],
      original_index: defaultKeypoints.indexOf(activePointName),
    };

    const updatedClickedPoints = [
      ...currentPoints.filter((p) => p.name !== activePointName),
      nextPoint,
    ];

    const sorted = sortPoints(updatedClickedPoints);
    upsertKeyframe(loadedFrameIndex, sorted);

    const updatedSelectedNames = sorted.map((p) => p.name);
    const nextActive =
      defaultKeypoints.find((name) => !updatedSelectedNames.includes(name)) || "";

    setActivePointName(nextActive || "");
    setError("");
  };

  const removePoint = (name: string) => {
    const updatedClickedPoints = currentPoints.filter((p) => p.name !== name);
    upsertKeyframe(loadedFrameIndex, updatedClickedPoints);
    setActivePointName(name);
    setError("");
  };

  const saveCurrentFrameAsKeyframe = () => {
    if (currentPoints.length === 0) {
      setError("Place at least one point before saving this frame as a keyframe.");
      return;
    }

    upsertKeyframe(loadedFrameIndex, currentPoints);
    setError("");

    const remaining = defaultKeypoints.find(
      (name) => !currentPoints.some((p) => p.name === name)
    );
    setActivePointName(remaining || "");
  };

  const goToNextUnsavedFrame = async () => {
    const candidate = clampFrameIfKnown(loadedFrameIndex + 10);
    await fetchFrame(candidate);
  };

  const handleSubmit = async () => {
    if (!sessionId || !setup) return;

    const normalizedKeyframes = keyframes
      .map((kf) => ({
        frame_index: kf.frame_index,
        selected_keypoints: sortPointsCanonical(kf.selected_keypoints),
      }))
      .filter((kf) => kf.selected_keypoints.length > 0)
      .sort((a, b) => a.frame_index - b.frame_index);

    if (normalizedKeyframes.length === 0) {
      setError("Please create at least one keyframe annotation before starting tracking.");
      return;
    }

    const firstNames = normalizedKeyframes[0].selected_keypoints.map((p) => p.name);
    const firstNamesJoined = firstNames.join("||");

    const hasMismatch = normalizedKeyframes.some((kf) => {
      const names = kf.selected_keypoints.map((p) => p.name);
      return names.join("||") !== firstNamesJoined;
    });

    if (hasMismatch) {
      setError("All saved keyframes must contain the same keypoint labels before tracking starts.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      if (normalizedKeyframes.length === 1) {
        await api.post(`/api/sessions/${sessionId}/classical-init/`, {
          start_frame: normalizedKeyframes[0].frame_index,
          selected_keypoints: normalizedKeyframes[0].selected_keypoints,
        });
      } else {
        await api.post(`/api/sessions/${sessionId}/classical-init/`, {
          keyframes: normalizedKeyframes,
        });
      }

      navigate(`/processing/${sessionId}`, { replace: true });
    } catch (err: any) {
      console.error(err);
      setError(
        err?.response?.data?.detail || "Failed to start classical tracking."
      );
    } finally {
      setSubmitting(false);
    }
  };

  const jumpFrame = (delta: number) => {
    setPendingFrameIndex((prev) => clampFrameIfKnown(prev + delta));
  };

  const handleFrameInput = (value: string) => {
    if (value.trim() === "") {
      setPendingFrameIndex(0);
      return;
    }

    const parsed = Number(value);
    if (Number.isNaN(parsed)) return;
    setPendingFrameIndex(clampFrameIfKnown(parsed));
  };

  const loadPendingFrame = async () => {
    await fetchFrame(pendingFrameIndex);
  };

  if (loadingSetup) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-semibold mb-4">Classical tracking setup</h1>
          <p className="text-slate-300">Loading session setup...</p>
        </div>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6">
        <div className="mx-auto max-w-6xl">
          <h1 className="text-2xl font-semibold mb-4">Classical tracking setup</h1>
          <p className="text-red-400">
            {error || "Session setup could not be loaded."}
          </p>
        </div>
      </div>
    );
  }

  const currentFrameHasSavedKeyframe = savedKeyframes.some(
    (kf) => kf.frame_index === loadedFrameIndex
  );

  return (
    <div className="min-h-screen bg-slate-950 text-white p-6">
      <div className="mx-auto max-w-7xl grid grid-cols-1 xl:grid-cols-[1.4fr_0.8fr] gap-6">
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h1 className="text-2xl font-semibold">Classical tracking setup</h1>
              <p className="text-sm text-slate-400 mt-1">
                Horse: {setup.horse_name || "Unknown"} · Gait: {setup.gait || "—"} · Frame {loadedFrameIndex}
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => jumpFrame(-10)}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700"
                type="button"
              >
                -10
              </button>
              <button
                onClick={() => jumpFrame(-1)}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700"
                type="button"
              >
                -1
              </button>
              <input
                type="number"
                min={0}
                max={maxKnownFrame ?? undefined}
                value={pendingFrameIndex}
                onChange={(e) => handleFrameInput(e.target.value)}
                className="w-28 px-3 py-2 rounded-lg bg-slate-950 border border-slate-700"
              />
              <button
                onClick={loadPendingFrame}
                className="px-3 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600"
                type="button"
                disabled={loadingFrame}
              >
                Load frame
              </button>
              <button
                onClick={() => jumpFrame(1)}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700"
                type="button"
              >
                +1
              </button>
              <button
                onClick={() => jumpFrame(10)}
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700"
                type="button"
              >
                +10
              </button>
            </div>
          </div>

          <div className="mb-4 text-sm text-slate-400">
            {loadingFrame
              ? `Loading frame ${pendingFrameIndex}...`
              : `Total frames: ${setup.total_frames ?? "unknown"} | FPS: ${setup.fps ?? "unknown"} | Loaded frame: ${loadedFrameIndex} | Saved keyframes: ${savedKeyframes.length}`}
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-700 bg-red-950/40 px-4 py-3 text-red-300">
              {error}
            </div>
          ) : null}

          <div className="overflow-hidden rounded-[26px] border border-[#415273] bg-black">
            {frameUrl ? (
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
                    src={frameUrl}
                    alt="Classical setup frame"
                    onClick={handleImageClick}
                    className="block max-w-full h-auto cursor-crosshair select-none rounded-xl"
                    draggable={false}
                  />

                  <div className="absolute inset-0 pointer-events-none">
                    {currentPoints.map((kp, idx) => (
                      <div
                        key={`${loadedFrameIndex}-${kp.name}`}
                        className="absolute"
                        style={{
                          left: `${kp.point[0] * 100}%`,
                          top: `${kp.point[1] * 100}%`,
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

        <aside className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
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
              {defaultKeypoints.map((name) => (
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
              onClick={goToNextUnsavedFrame}
              className="w-full px-4 py-2 rounded-xl bg-sky-700 hover:bg-sky-600 font-medium"
            >
              Go to next frame for annotation
            </button>

            <button
              type="button"
              onClick={clearCurrentFramePoints}
              className="w-full px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700"
            >
              Clear current frame points
            </button>

            <button
              type="button"
              onClick={removeCurrentKeyframe}
              disabled={!currentFrameHasSavedKeyframe}
              className="w-full px-4 py-2 rounded-xl bg-red-900/50 hover:bg-red-800/60 disabled:opacity-50 disabled:cursor-not-allowed text-red-100"
            >
              Remove current keyframe
            </button>
          </div>

          <div className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-slate-200">Points on current frame</h3>
              <span className="text-xs text-slate-400">
                {currentPoints.length} placed
              </span>
            </div>

            <div className="space-y-2 max-h-64 overflow-auto pr-1">
              {currentPoints.length === 0 ? (
                <div className="text-sm text-slate-400">No points placed on this frame.</div>
              ) : (
                currentPoints.map((kp, idx) => (
                  <div
                    key={`${loadedFrameIndex}-${kp.name}`}
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
                        x={kp.point[0].toFixed(4)}, y={kp.point[1].toFixed(4)}
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
              {savedKeyframes.length === 0 ? (
                <div className="text-sm text-slate-400">No saved keyframes yet.</div>
              ) : (
                savedKeyframes.map((kf, idx) => (
                  <button
                    key={kf.frame_index}
                    type="button"
                    onClick={() => fetchFrame(kf.frame_index)}
                    className={`w-full text-left rounded-xl border px-3 py-2 ${
                      kf.frame_index === loadedFrameIndex
                        ? "border-emerald-500 bg-emerald-500/10"
                        : "border-slate-800 bg-slate-950 hover:bg-slate-900"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-medium text-slate-200">
                        Keyframe {idx + 1}
                      </div>
                      <div className="text-xs text-slate-400">
                        Frame {kf.frame_index}
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-400">
                      {kf.selected_keypoints.length} keypoints
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="mb-5">
            <h3 className="text-sm font-medium text-slate-200 mb-2">
              Recommended workflow
            </h3>
            <ul className="text-sm text-slate-400 space-y-2 list-disc pl-5">
              <li>Annotate the first clean frame and save it as a keyframe.</li>
              <li>Load a different frame and place the same landmark set again.</li>
              <li>Every saved keyframe must contain the same label set before tracking starts.</li>
            </ul>
          </div>

          <div className="space-y-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || savedKeyframes.length === 0}
              className="w-full px-4 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              {submitting ? "Starting classical tracking..." : "Start classical tracking"}
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
    </div>
  );
};

export default ClassicalSetupPage;