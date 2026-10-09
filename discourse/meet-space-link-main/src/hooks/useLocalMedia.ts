import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import {
  MediaError,
  getLocalMedia,
  getScreenStream,
  listDevices,
  stopStream,
} from "@/services/media/devices";

export interface LocalMediaState {
  stream: MediaStream | null;
  screenStream: MediaStream | null;
  micEnabled: boolean;
  cameraEnabled: boolean;
  screenSharing: boolean;
  error: string | null;
  ready: boolean;
  devices: { cameras: MediaDeviceInfo[]; microphones: MediaDeviceInfo[] };
  toggleMic: () => void;
  toggleCamera: () => void;
  startScreenShare: () => Promise<void>;
  stopScreenShare: () => void;
  stopAll: () => void;
}

/**
 * Generates an active, animated synthetic MediaStream (Video + Audio)
 * ensuring audio and video media streams ALWAYS function reliably on HTTP IP origins.
 */
function createSyntheticStream(label: string = "Participant"): MediaStream {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext("2d");

  let frame = 0;
  const draw = () => {
    if (!ctx) return;
    frame++;

    // Animated dark gradient background
    const grad = ctx.createLinearGradient(0, 0, 640, 480);
    grad.addColorStop(0, "#0f172a");
    grad.addColorStop(0.5, "#1e293b");
    grad.addColorStop(1, "#0369a1");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 640, 480);

    // Animated pulsing aura
    const radius = 55 + Math.sin(frame * 0.08) * 12;
    ctx.beginPath();
    ctx.arc(320, 210, radius, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(56, 189, 248, 0.35)";
    ctx.fill();

    // Center Avatar Circle
    ctx.beginPath();
    ctx.arc(320, 210, 45, 0, Math.PI * 2);
    ctx.fillStyle = "#0284c7";
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = "#38bdf8";
    ctx.stroke();

    // Text Label (Pre-mirrored context so browser scaleX(-1) displays correctly)
    ctx.save();
    ctx.translate(640, 0);
    ctx.scale(-1, 1);

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 32px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(label.slice(0, 1).toUpperCase() || "V", 320, 222);

    ctx.fillStyle = "#e0f2fe";
    ctx.font = "bold 16px sans-serif";
    ctx.fillText(label, 320, 310);

    ctx.fillStyle = "#38bdf8";
    ctx.font = "12px monospace";
    ctx.fillText("LIVE VIDEO FEED ACTIVE", 320, 335);

    ctx.restore();
  };

  draw();
  const anim = setInterval(draw, 100);

  const videoStream = canvas.captureStream(20);
  const videoTrack = videoStream.getVideoTracks()[0];

  // Synthesize pleasant ambient audio track using Web Audio API
  let audioTrack: MediaStreamTrack | null = null;
  try {
    const AudioCtx = typeof window !== "undefined" ? (window.AudioContext || (window as any).webkitAudioContext) : null;
    if (AudioCtx) {
      const audioCtx = new AudioCtx();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      const dst = audioCtx.createMediaStreamDestination();

      osc.type = "sine";
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.01, audioCtx.currentTime); // Audible Pleasant Tone

      osc.connect(gain);
      gain.connect(dst);
      osc.start();

      audioTrack = dst.stream.getAudioTracks()[0];
    }
  } catch {
    /* best effort */
  }

  const stream = new MediaStream();
  if (videoTrack) stream.addTrack(videoTrack);
  if (audioTrack) stream.addTrack(audioTrack);

  if (videoTrack) {
    videoTrack.addEventListener("ended", () => clearInterval(anim));
  }

  return stream;
}

export function useLocalMedia(active: boolean = true): LocalMediaState {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [devices, setDevices] = useState<{
    cameras: MediaDeviceInfo[];
    microphones: MediaDeviceInfo[];
  }>({ cameras: [], microphones: [] });

  const streamRef = useRef<MediaStream | null>(null);
  const screenRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    (async () => {
      try {
        const result = await getLocalMedia({ video: true, audio: true });
        if (cancelled) {
          stopStream(result.stream);
          return;
        }
        streamRef.current = result.stream;
        setStream(result.stream);
        setCameraEnabled(result.hasVideo);
        setMicEnabled(result.hasAudio);
        setError(null);
        const all = await listDevices();
        if (!cancelled) {
          setDevices({
            cameras: all.filter((d) => d.kind === "videoinput"),
            microphones: all.filter((d) => d.kind === "audioinput"),
          });
        }
      } catch (err) {
        if (!cancelled) {
          console.warn("Camera/microphone access failed:", err);
          setError(
            err instanceof MediaError ? err.message : "Camera and microphone access unavailable.",
          );
          // Previously replaced a real failure with a fake canvas+tone
          // MediaStream and forced cameraEnabled/micEnabled to true, which
          // silently sent a fake video/audio feed over WebRTC and hid the
          // real error from the user (PreJoinScreen's "Camera unavailable"
          // messaging already exists and is correct — it just never
          // triggered because stream was always truthy). Leaving stream
          // null and both flags false lets that existing UI do its job.
          streamRef.current = null;
          setStream(null);
          setCameraEnabled(false);
          setMicEnabled(false);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active]);

  const stopAll = useCallback(() => {
    stopStream(streamRef.current);
    stopStream(screenRef.current);
    streamRef.current = null;
    screenRef.current = null;
    setStream(null);
    setScreenStream(null);
  }, []);

  useEffect(() => () => stopAll(), [stopAll]);

  const toggleMic = useCallback(() => {
    if (!streamRef.current) return;
    const tracks = streamRef.current.getAudioTracks();
    if (tracks.length === 0) return;
    const next = !tracks[0]!.enabled;
    tracks.forEach((t) => {
      t.enabled = next;
    });
    setMicEnabled(next);
  }, []);

  const toggleCamera = useCallback(() => {
    if (!streamRef.current) return;
    const tracks = streamRef.current.getVideoTracks();
    if (tracks.length === 0) return;
    const next = !tracks[0]!.enabled;
    tracks.forEach((t) => {
      t.enabled = next;
    });
    setCameraEnabled(next);
  }, []);

  const startScreenShare = useCallback(async () => {
    try {
      const res = await getScreenStream();
      screenRef.current = res.stream;
      setScreenStream(res.stream);
      res.stream.getVideoTracks()[0]?.addEventListener("ended", () => {
        screenRef.current = null;
        setScreenStream(null);
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not share screen");
    }
  }, []);

  const stopScreenShare = useCallback(() => {
    stopStream(screenRef.current);
    screenRef.current = null;
    setScreenStream(null);
  }, []);

  return {
    stream,
    screenStream,
    micEnabled,
    cameraEnabled,
    screenSharing: Boolean(screenStream),
    error,
    ready,
    devices,
    toggleMic,
    toggleCamera,
    startScreenShare,
    stopScreenShare,
    stopAll,
  };
}