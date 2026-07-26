import { useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward } from "lucide-react";
import HorseCanvas from "./HorseCanvas";

interface VideoPlayerProps {
  currentFrame: number;
  setCurrentFrame: (f: number) => void;
  isPlaying: boolean;
  setIsPlaying: (p: boolean) => void;
  totalFrames: number;
  fps?: number;
  videoUrl?: string | null;
  frameData?: any;
}

export default function VideoPlayer({
  currentFrame,
  setCurrentFrame,
  isPlaying,
  setIsPlaying,
  totalFrames,
  fps = 30,
  videoUrl,
  frameData,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const isSeekingRef = useRef(false);

  const [videoError, setVideoError] = useState("");

  const safeFps = useMemo(() => {
    return Number.isFinite(fps) && fps > 0 ? fps : 30;
  }, [fps]);

  const safeTotalFrames = useMemo(() => {
    return Math.max(totalFrames || 0, 1);
  }, [totalFrames]);

  const progress =
    safeTotalFrames > 1 ? currentFrame / (safeTotalFrames - 1) : 0;

  const preferredVideoUrl = videoUrl || "";

  const isPreAnnotatedVideo =
    preferredVideoUrl.includes("/media/annotated_videos/") ||
    preferredVideoUrl.includes("annotated");

  const stopAnimationLoop = () => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const startAnimationLoop = () => {
    stopAnimationLoop();

    const tick = () => {
      const video = videoRef.current;
      if (!video) return;

      if (!video.paused && !video.ended) {
        const nextFrame = Math.min(
          Math.round(video.currentTime * safeFps),
          Math.max(safeTotalFrames - 1, 0)
        );
        setCurrentFrame(nextFrame);
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !preferredVideoUrl) return;

    if (isPlaying) {
      void video.play().catch((err) => {
        console.error("Video play failed:", err);
        setVideoError("Could not start video playback.");
        setIsPlaying(false);
      });
    } else {
      video.pause();
    }
  }, [isPlaying, preferredVideoUrl, setIsPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(safeFps) || safeFps <= 0) return;
    if (isSeekingRef.current) return;

    const targetTime = currentFrame / safeFps;
    if (Math.abs(video.currentTime - targetTime) > 0.08) {
      video.currentTime = targetTime;
    }
  }, [currentFrame, safeFps]);

  useEffect(() => {
    return () => stopAnimationLoop();
  }, []);

  const handleLoadedMetadata = () => {
    setVideoError("");
  };

  const handleLoadedData = () => {
    setVideoError("");
  };

  const handlePlay = () => {
    setVideoError("");
    setIsPlaying(true);
    startAnimationLoop();
  };

  const handlePause = () => {
    setIsPlaying(false);
    stopAnimationLoop();
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video || !Number.isFinite(safeFps) || safeFps <= 0) return;

    const nextFrame = Math.min(
      Math.round(video.currentTime * safeFps),
      Math.max(safeTotalFrames - 1, 0)
    );
    setCurrentFrame(nextFrame);
  };

  const handleSeeked = () => {
    isSeekingRef.current = false;
  };

  const handleEnded = () => {
    stopAnimationLoop();
    setIsPlaying(false);
    setCurrentFrame(Math.max(safeTotalFrames - 1, 0));
  };

  const handleVideoError = () => {
    const video = videoRef.current;
    const mediaError = video?.error;

    let message = "Video failed to load.";
    if (mediaError) {
      switch (mediaError.code) {
        case mediaError.MEDIA_ERR_ABORTED:
          message = "Video loading was aborted.";
          break;
        case mediaError.MEDIA_ERR_NETWORK:
          message = "Network error while loading video.";
          break;
        case mediaError.MEDIA_ERR_DECODE:
          message = "Video decoding failed. The MP4 codec is likely unsupported.";
          break;
        case mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED:
          message = "Video source not supported by the browser.";
          break;
        default:
          message = "Unknown video error.";
      }
    }

    console.error("Video error:", {
      url: preferredVideoUrl,
      mediaError,
    });

    setVideoError(message);
    setIsPlaying(false);
    stopAnimationLoop();
  };

  const seekToFrame = (frame: number) => {
    const safeFrame = Math.max(0, Math.min(safeTotalFrames - 1, frame));
    setCurrentFrame(safeFrame);

    const video = videoRef.current;
    if (!video || !Number.isFinite(safeFps) || safeFps <= 0) return;

    isSeekingRef.current = true;
    video.currentTime = safeFrame / safeFps;
  };

  return (
    <div className="flex flex-col bg-black rounded border border-border overflow-hidden">
      <div className="relative w-full bg-black aspect-video">
        {preferredVideoUrl ? (
          <>
            <video
              ref={videoRef}
              className="w-full h-full object-contain bg-black"
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onLoadedData={handleLoadedData}
              onSeeked={handleSeeked}
              onPlay={startAnimationLoop}
              onPause={handlePause}
              onEnded={handleEnded}
              onError={handleVideoError}
              controls={false}
              playsInline
              preload="metadata"
            >
              <source src={preferredVideoUrl} type="video/mp4" />
              Your browser does not support the video tag.
            </video>

            {!isPreAnnotatedVideo && (
              <div className="absolute inset-0 pointer-events-none">
                <HorseCanvas
                  currentFrame={currentFrame}
                  isPlaying={isPlaying}
                  frameData={frameData}
                />
              </div>
            )}

            {videoError && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-white text-sm px-4 text-center">
                <div>
                  <p className="font-medium mb-1">{videoError}</p>
                  <p className="text-xs text-slate-300 break-all">
                    {preferredVideoUrl}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400 text-sm">
            No video available
          </div>
        )}
      </div>

      <div className="bg-[#0f172a] px-3 py-2.5 flex items-center gap-3">
        <button
          onClick={() => seekToFrame(0)}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          type="button"
        >
          <SkipBack size={14} />
        </button>

        <button
          onClick={() => {
            if (isPlaying) {
              handlePause();
            } else {
              handlePlay();
            }
          }}
          className="w-7 h-7 bg-blue-600 rounded-full flex items-center justify-center hover:bg-blue-500 transition-colors flex-shrink-0"
          type="button"
        >
          {isPlaying ? (
            <Pause size={11} className="text-white" />
          ) : (
            <Play size={11} className="text-white ml-0.5" />
          )}
        </button>

        <button
          onClick={() => seekToFrame(Math.max(safeTotalFrames - 1, 0))}
          className="text-slate-500 hover:text-slate-300 transition-colors"
          type="button"
        >
          <SkipForward size={14} />
        </button>

        <div
          className="flex-1 relative h-1 bg-slate-700 rounded-full cursor-pointer group"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width;
            seekToFrame(
              Math.round(Math.max(0, Math.min(1, x)) * (safeTotalFrames - 1))
            );
          }}
        >
          <div
            className="absolute left-0 top-0 h-full bg-blue-500 rounded-full transition-none"
            style={{ width: `${progress * 100}%` }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"
            style={{ left: `calc(${progress * 100}% - 6px)` }}
          />
        </div>

        <span className="text-slate-400 font-mono text-xs tabular-nums flex-shrink-0">
          {(currentFrame / safeFps).toFixed(1)}s&nbsp;/&nbsp;
          {(safeTotalFrames / safeFps).toFixed(1)}s
        </span>
      </div>
    </div>
  );
}