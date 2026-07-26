import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Loader2, MousePointerClick } from "lucide-react";
import { useNavigate, useParams } from "react-router-dom";
import Layout from "./Layout";
import api from "../api";

type TrackingMode = "yolo26" | "classical";

type SessionStatusResponse = {
  session_id: string;
  status: string;
  progress: number;
  current_step: string;
  original_filename?: string;
  horse_id?: string | null;
  horse_name?: string | null;
  error_message?: string;
  tracking_mode?: TrackingMode;
};

const YOLO_STEPS = [
  "Queued for processing",
  "Loading model",
  "Opening video",
  "Running pose analysis",
  "Encoding annotated video",
  "Analysis complete",
] as const;

const CLASSICAL_STEPS = [
  "Waiting for classical setup",
  "Queued for classical tracking",
  "Opening video",
  "Tracking manual keypoints",
  "Computing gait metrics",
  "Encoding classical overlay",
  "Classical tracking complete",
] as const;

function getStepIndex(step: string, mode: TrackingMode) {
  const normalized = (step || "").toLowerCase();

  const steps = mode === "classical" ? CLASSICAL_STEPS : YOLO_STEPS;
  const exact = steps.findIndex((item) => item.toLowerCase() === normalized);
  if (exact !== -1) return exact;

  if (mode === "classical") {
    if (normalized.includes("waiting for classical setup")) return 0;
    if (normalized.includes("queued")) return 1;
    if (normalized.includes("opening")) return 2;
    if (
      normalized.includes("tracking manual keypoints") ||
      normalized.includes("classical tracking frame") ||
      normalized.includes("lk tracking") ||
      normalized.includes("tracking landmarks")
    ) {
      return 3;
    }
    if (
      normalized.includes("computing gait metrics") ||
      normalized.includes("saving classical results") ||
      normalized.includes("normalized curves") ||
      normalized.includes("summary")
    ) {
      return 4;
    }
    if (normalized.includes("encoding")) return 5;
    if (normalized.includes("complete") || normalized.includes("done")) return 6;
    return 0;
  }

  if (normalized.includes("queued")) return 0;
  if (normalized.includes("loading")) return 1;
  if (normalized.includes("opening")) return 2;
  if (normalized.includes("processing frame") || normalized.includes("pose")) return 3;
  if (normalized.includes("encoding")) return 4;
  if (normalized.includes("complete") || normalized.includes("done")) return 5;
  return 0;
}

export default function ProcessingPage() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const intervalRef = useRef<number | null>(null);
  const navigatingRef = useRef(false);
  const mountedRef = useRef(true);
  const startedAtRef = useRef<number>(Date.now());

  const [percent, setPercent] = useState(0);
  const [status, setStatus] = useState("queued");
  const [currentStep, setCurrentStep] = useState("Queued for processing");
  const [filename, setFilename] = useState("");
  const [horseName, setHorseName] = useState("");
  const [error, setError] = useState("");
  const [debugStatus, setDebugStatus] = useState("");
  const [trackingMode, setTrackingMode] = useState<TrackingMode>("yolo26");

  const stepOrder = useMemo(() => {
    return trackingMode === "classical" ? CLASSICAL_STEPS : YOLO_STEPS;
  }, [trackingMode]);

  const currentStepIndex = useMemo(() => {
    return getStepIndex(currentStep, trackingMode);
  }, [currentStep, trackingMode]);

  useEffect(() => {
    mountedRef.current = true;

    if (!sessionId) {
      setError("Missing session ID.");
      return () => {
        mountedRef.current = false;
      };
    }

    const stopPolling = () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };

    const poll = async () => {
      try {
        const res = await api.get<SessionStatusResponse>(
          `/api/sessions/${sessionId}/status/`,
          { params: { t: Date.now() } }
        );

        if (!mountedRef.current) return;

        const data = res.data;
        const nextMode: TrackingMode = data.tracking_mode === "classical" ? "classical" : "yolo26";
        const nextStatus = data.status ?? "queued";
        const nextProgress = Number(data.progress ?? 0);

        let nextStep = data.current_step || "Queued for processing";
        if (nextMode === "classical" && nextStatus === "awaiting_setup") {
          nextStep = "Waiting for classical setup";
        }

        setTrackingMode(nextMode);
        setStatus(nextStatus);
        setPercent(Math.max(0, Math.min(100, nextProgress)));
        setCurrentStep(nextStep);
        setFilename(data.original_filename || "");
        setHorseName(data.horse_name || "");
        setError("");
        setDebugStatus(
          `mode=${nextMode} status=${nextStatus} progress=${nextProgress} step=${nextStep}`
        );

        if (nextMode === "classical" && nextStatus === "awaiting_setup" && !navigatingRef.current) {
          navigatingRef.current = true;
          stopPolling();
          navigate(`/sessions/${sessionId}/classical-setup`, { replace: true });
          return;
        }

        if (nextStatus === "done" && !navigatingRef.current) {
          navigatingRef.current = true;
          stopPolling();
          navigate(`/results/${sessionId}`, { replace: true });
          return;
        }

        if (nextStatus === "failed") {
          stopPolling();
          setError(data.error_message || "Processing failed.");
          return;
        }

        const elapsedMs = Date.now() - startedAtRef.current;
        if (elapsedMs > 10 * 60 * 1000) {
          stopPolling();
          setError("Analysis is taking longer than expected. Please refresh or check again shortly.");
        }
      } catch (err: any) {
        console.error(err);
        if (!mountedRef.current) return;
        setError(err.response?.data?.detail || "Could not fetch processing status.");
      }
    };

    poll();
    intervalRef.current = window.setInterval(poll, 2000);

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [sessionId, navigate]);

  const heading =
    status === "failed"
      ? trackingMode === "classical"
        ? "Classical tracking failed"
        : "Analysis failed"
      : status === "done"
      ? trackingMode === "classical"
        ? "Classical tracking complete"
        : "Analysis complete"
      : status === "awaiting_setup"
      ? "Classical setup required"
      : trackingMode === "classical"
      ? "Tracking classical landmarks…"
      : "Processing video…";

  const subtitle =
    trackingMode === "classical"
      ? "Classical LK tracking"
      : "YOLO-Pose v8 · 2D Sagittal";

  return (
    <Layout current="upload">
      <div className="max-w-xl mx-auto px-6 py-16 space-y-8">
        <div className="text-center">
          <div className="w-14 h-14 rounded-full bg-teal-50 border-2 border-teal-200 flex items-center justify-center mx-auto mb-5">
            {status === "failed" ? (
              <AlertCircle size={24} className="text-red-600" />
            ) : status === "done" ? (
              <CheckCircle size={24} className="text-teal-700" />
            ) : status === "awaiting_setup" ? (
              <MousePointerClick size={22} className="text-amber-600" />
            ) : (
              <Loader2 size={22} className="text-teal-700 animate-spin" />
            )}
          </div>

          <h1 className="text-lg font-semibold text-foreground">{heading}</h1>

          <p className="text-sm text-muted-foreground mt-1">
            {horseName || "Horse analysis session"}
          </p>

          <p className="text-sm text-muted-foreground font-mono mt-1 truncate max-w-xs mx-auto">
            {filename || sessionId}
          </p>

          <p className="text-xs text-muted-foreground mt-2">
            Live step: {currentStep}
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground font-mono mb-2">
            <span>{subtitle}</span>
            <span>{Math.round(percent)}%</span>
          </div>

          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                status === "failed"
                  ? "bg-red-600"
                  : status === "awaiting_setup"
                  ? "bg-amber-500"
                  : "bg-teal-600"
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="bg-white border border-border rounded-lg divide-y divide-border overflow-hidden">
          {stepOrder.map((stepLabel, i) => {
            const done = i < currentStepIndex;
            const current = i === currentStepIndex && status !== "failed";
            const failed = status === "failed" && i === currentStepIndex;

            return (
              <div
                key={stepLabel}
                className={`flex items-start gap-3 px-5 py-3.5 transition-colors ${
                  current ? "bg-teal-50/60" : failed ? "bg-red-50" : ""
                }`}
              >
                <div className="mt-0.5 flex-shrink-0">
                  {done ? (
                    <CheckCircle size={14} className="text-teal-700" />
                  ) : current ? (
                    status === "awaiting_setup" ? (
                      <MousePointerClick size={14} className="text-amber-600" />
                    ) : (
                      <Loader2 size={14} className="text-teal-700 animate-spin" />
                    )
                  ) : failed ? (
                    <AlertCircle size={14} className="text-red-600" />
                  ) : (
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-border" />
                  )}
                </div>

                <div>
                  <p
                    className={`text-sm font-medium ${
                      done || current
                        ? "text-foreground"
                        : failed
                        ? "text-red-700"
                        : "text-muted-foreground"
                    }`}
                  >
                    {stepLabel}
                  </p>
                </div>
              </div>
            );
          })}
        </div>

        {status === "awaiting_setup" && trackingMode === "classical" && (
          <div className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-4 py-3">
            Manual keypoint selection is required before classical tracking can begin.
          </div>
        )}

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-4 py-3">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between gap-3">
          <button
            onClick={() => navigate("/sessions")}
            className="text-sm border border-border hover:bg-muted/40 text-foreground rounded-md px-4 py-2 transition-colors"
          >
            Back to sessions
          </button>

          {status === "awaiting_setup" && trackingMode === "classical" ? (
            <button
              onClick={() => navigate(`/sessions/${sessionId}/classical-setup`)}
              className="text-sm bg-amber-600 hover:bg-amber-700 text-white rounded-md px-4 py-2 transition-colors"
            >
              Open classical setup
            </button>
          ) : (
            <button
              onClick={() => navigate(`/results/${sessionId}`)}
              disabled={status !== "done"}
              className="text-sm bg-teal-700 hover:bg-teal-800 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-md px-4 py-2 transition-colors"
            >
              Open results
            </button>
          )}
        </div>

        <div className="text-xs text-muted-foreground bg-muted/40 rounded-md px-3 py-2 font-mono">
          {debugStatus || "Waiting for first status response..."}
        </div>
      </div>
    </Layout>
  );
}