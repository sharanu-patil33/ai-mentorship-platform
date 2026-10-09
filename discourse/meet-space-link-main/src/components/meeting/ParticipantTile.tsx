import { Crown, Mic, MicOff, MonitorUp, VideoOff } from "lucide-react";
import { useEffect, useRef } from "react";

import { initialsOf } from "@/lib/utils";
import type { MediaParticipant } from "@/types";

/** A single participant tile rendering that peer's live media stream. */
export function ParticipantTile({
  participant,
  isStage = false,
}: {
  participant: MediaParticipant;
  isStage?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Attach live MediaStream to video element when stream or video tracks change
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (participant.stream && participant.cameraEnabled) {
      if (el.srcObject !== participant.stream) {
        el.srcObject = participant.stream;
      }
      void el.play().catch(() => {});
    } else {
      el.srcObject = null;
    }
  }, [participant.stream, participant.cameraEnabled]);

  // Dedicated Audio Element: Plays remote participant audio tracks reliably
  useEffect(() => {
    const aEl = audioRef.current;
    if (!aEl || participant.isLocal) return;

    if (participant.stream && participant.micEnabled) {
      if (aEl.srcObject !== participant.stream) {
        aEl.srcObject = participant.stream;
      }
      void aEl.play().catch(() => {});
    } else {
      aEl.srcObject = null;
    }
  }, [participant.stream, participant.micEnabled, participant.isLocal]);

  const initials = initialsOf(participant.displayName || "Participant");

  return (
    <div
      className={`group relative flex items-center justify-center overflow-hidden rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900 to-slate-950 shadow-2xl transition-all duration-300 ${
        isStage ? "h-full w-full" : "h-full w-full min-h-[220px]"
      } ${
        participant.micEnabled
          ? "ring-1 ring-cyan-500/30 hover:ring-cyan-500/60"
          : "hover:border-slate-700"
      }`}
    >
      {/* Dedicated Hidden Remote Audio Player */}
      {!participant.isLocal && <audio ref={audioRef} autoPlay playsInline muted={false} className="hidden" />}

      {/* Video Element */}
      {participant.stream && participant.cameraEnabled ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={participant.isLocal}
          className={`h-full w-full object-cover transition-all ${participant.isLocal ? "-scale-x-100" : ""}`}
        />
      ) : (
        /* Video Off Fallback Avatar - Glowing Gradient Disc */
        <div className="flex flex-col items-center justify-center space-y-3 p-6 text-center">
          <div className="relative flex size-24 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-600 via-blue-600 to-indigo-600 font-display text-3xl font-extrabold text-white shadow-2xl ring-4 ring-cyan-500/30 transition-transform duration-300 group-hover:scale-105">
            {initials}
          </div>
          <span className="text-xs font-semibold text-slate-300/80 tracking-wide">
            {participant.displayName}
          </span>
        </div>
      )}

      {/* Status Overlay Badges */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-slate-950 via-slate-950/70 to-transparent p-3.5 text-xs font-semibold text-white">
        <div className="flex items-center gap-2 truncate rounded-full bg-slate-900/80 backdrop-blur-md px-3 py-1.5 border border-slate-800/80 shadow-lg">
          {participant.role === "host" ? (
            <Crown className="size-3.5 text-amber-400 shrink-0" />
          ) : null}
          <span className="truncate text-white font-semibold tracking-wide">
            {participant.displayName} {participant.isLocal ? "(You)" : ""}
          </span>
          {participant.screenSharing ? (
            <MonitorUp className="size-3.5 text-cyan-400 shrink-0 animate-pulse" />
          ) : null}
        </div>

        <div className="flex items-center gap-1.5">
          {participant.micEnabled ? (
            <span className="flex size-8 items-center justify-center rounded-full bg-slate-900/90 text-emerald-400 border border-slate-800 shadow-md backdrop-blur-md">
              <Mic className="size-4" />
            </span>
          ) : (
            <span className="flex size-8 items-center justify-center rounded-full bg-red-600 text-white border border-red-500 shadow-md">
              <MicOff className="size-4" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
