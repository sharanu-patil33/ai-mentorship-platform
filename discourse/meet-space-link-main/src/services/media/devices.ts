/**
 * Thin, UI-free wrapper around the browser media APIs.
 *
 * Everything that can fail (missing device, denied permission, unsupported
 * browser) is normalised into a `MediaError` with a human message so the UI
 * never has to show a raw DOMException.
 */

export type MediaErrorKind =
  | "permission-denied"
  | "not-found"
  | "in-use"
  | "unsupported"
  | "unknown";

export class MediaError extends Error {
  kind: MediaErrorKind;
  constructor(kind: MediaErrorKind, message: string) {
    super(message);
    this.name = "MediaError";
    this.kind = kind;
  }
}

export function supportsUserMedia(): boolean {
  return (
    typeof navigator !== "undefined" &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof RTCPeerConnection !== "undefined"
  );
}

export function supportsDisplayMedia(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getDisplayMedia);
}

function toMediaError(error: unknown): MediaError {
  const name = (error as DOMException | undefined)?.name ?? "";
  switch (name) {
    case "NotAllowedError":
    case "SecurityError":
      return new MediaError(
        "permission-denied",
        "Camera and microphone access was blocked. Allow access in your browser settings and try again.",
      );
    case "NotFoundError":
    case "OverconstrainedError":
      return new MediaError("not-found", "No camera or microphone was found on this device.");
    case "NotReadableError":
    case "AbortError":
      return new MediaError(
        "in-use",
        "Your camera or microphone is being used by another application.",
      );
    default:
      return new MediaError("unknown", "We couldn't start your camera or microphone.");
  }
}

export interface LocalMediaResult {
  stream: MediaStream;
  hasVideo: boolean;
  hasAudio: boolean;
}

/**
 * Requests camera + microphone, degrading gracefully: if the camera is
 * unavailable we still return an audio-only stream (and vice versa).
 */
export async function getLocalMedia(opts: {
  video?: boolean;
  audio?: boolean;
} = {}): Promise<LocalMediaResult> {
  if (!supportsUserMedia()) {
    if (typeof window !== "undefined" && window.isSecureContext === false) {
      throw new MediaError(
        "unsupported",
        "Camera and microphone require HTTPS or localhost. If testing locally, open http://localhost:8080 instead of an IP address.",
      );
    }
    throw new MediaError(
      "unsupported",
      "Camera and microphone access is unavailable in this browser context. You can still join with camera turned off.",
    );
  }

  const wantVideo = opts.video ?? true;
  const wantAudio = opts.audio ?? true;

  const constraints: MediaStreamConstraints = {
    video: wantVideo ? { width: { ideal: 1280 }, height: { ideal: 720 } } : false,
    audio: wantAudio ? { echoCancellation: true, noiseSuppression: true } : false,
  };

  try {
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    return {
      stream,
      hasVideo: stream.getVideoTracks().length > 0,
      hasAudio: stream.getAudioTracks().length > 0,
    };
  } catch (error) {
    const normalized = toMediaError(error);
    // Fall back to a single-kind stream before giving up entirely.
    if (normalized.kind !== "permission-denied" && wantVideo && wantAudio) {
      try {
        const audioOnly = await navigator.mediaDevices.getUserMedia({ audio: true });
        return { stream: audioOnly, hasVideo: false, hasAudio: true };
      } catch {
        /* fall through */
      }
      try {
        const videoOnly = await navigator.mediaDevices.getUserMedia({ video: true });
        return { stream: videoOnly, hasVideo: true, hasAudio: false };
      } catch {
        /* fall through */
      }
    }
    throw normalized;
  }
}

export async function getScreenStream(): Promise<MediaStream> {
  if (!supportsDisplayMedia()) {
    throw new MediaError("unsupported", "Screen sharing is not supported in this browser context.");
  }
  try {
    return await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 15, max: 30 } },
      audio: false,
    });
  } catch (error) {
    const errName = (error as DOMException | undefined)?.name ?? "";
    const errMsg = (error as Error | undefined)?.message ?? "";
    if (
      errName === "NotAllowedError" ||
      errName === "PermissionDeniedError" ||
      errName === "AbortError" ||
      errMsg.toLowerCase().includes("permission denied") ||
      errMsg.toLowerCase().includes("cancelled") ||
      errMsg.toLowerCase().includes("canceled") ||
      errMsg.toLowerCase().includes("user denied")
    ) {
      throw new MediaError("permission-denied", "Screen sharing was cancelled.");
    }
    throw new MediaError("unknown", errMsg || "Screen sharing could not be started.");
  }
}

export function stopStream(stream: MediaStream | null | undefined) {
  stream?.getTracks().forEach((track) => track.stop());
}

export async function listDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    return await navigator.mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
}
