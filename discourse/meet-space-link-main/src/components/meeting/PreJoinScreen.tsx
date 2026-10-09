import { Camera, Check, Copy, Crown, Mic, MicOff, ShieldCheck, Sparkles, Video, VideoOff, Volume2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocalMedia } from "@/hooks/useLocalMedia";
import type { Meeting } from "@/types";

/** Device check + name entry before entering the room. */
export function PreJoinScreen({
  meeting,
  defaultName,
  nameLocked,
  joining,
  onJoin,
}: {
  meeting: Meeting;
  defaultName: string;
  nameLocked: boolean;
  joining: boolean;
  onJoin: (displayName: string) => void;
}) {
  const [name, setName] = useState(defaultName || "");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const media = useLocalMedia(true);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    if (defaultName && (!name || name === defaultName)) {
      setName(defaultName);
    }
  }, [defaultName]);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = media.stream;
    if (media.stream) void el.play().catch(() => undefined);
  }, [media.stream]);

  function handleCopyCode() {
    navigator.clipboard.writeText(meeting.meeting_id).then(() => {
      setCopied(true);
      toast.success("Meeting code copied!");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim().length < 2) {
      setError("Enter a display name with at least 2 characters.");
      return;
    }
    setError(null);
    media.stopAll();
    onJoin(name.trim());
  }

  const showPreview = Boolean(media.stream) && media.cameraEnabled;
  const initials = (name.trim() || "P")
    .split(" ")
    .map((n) => n[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 p-6 md:p-10">
      {/* Top Header Badge */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-cyan-500/10 text-cyan-400 ring-1 ring-cyan-500/30">
            <Sparkles className="size-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">{meeting.title}</h1>
            <p className="text-xs font-medium text-slate-400">Ready to join your room</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCopyCode}
          className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/90 px-3 py-1.5 text-xs font-mono font-medium text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-800 hover:text-white"
        >
          <span>{meeting.meeting_id}</span>
          {copied ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5 text-slate-400" />}
        </button>
      </div>

      <div className="grid gap-8 md:grid-cols-[1.3fr_1fr] md:items-start">
        {/* Left Column: Camera Preview Box & Device Selectors */}
        <div className="space-y-4">
          <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl ring-1 ring-white/10">
            {/* Live Video Preview */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`size-full -scale-x-100 object-cover transition-opacity duration-300 ${
                showPreview ? "opacity-100" : "opacity-0"
              }`}
            />

            {/* Video Off Fallback Avatar */}
            {!showPreview && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 to-slate-950 p-6 text-center">
                <div className="relative flex size-20 items-center justify-center rounded-full bg-gradient-to-tr from-cyan-600 to-blue-500 text-2xl font-bold text-white shadow-xl ring-4 ring-cyan-500/20">
                  {initials || "P"}
                </div>
                <p className="mt-3 text-sm font-semibold text-slate-200">
                  {media.error ? "Camera Unavailable" : "Camera is Turned Off"}
                </p>
                <p className="mt-1 max-w-xs text-xs text-slate-400">
                  {media.error ?? "Your audio will still connect when you join."}
                </p>
              </div>
            )}

            {/* Live Preview Indicator Badge */}
            <div className="absolute top-3.5 left-3.5 flex items-center gap-2 rounded-full bg-slate-900/80 backdrop-blur-md px-3 py-1 border border-slate-800/80 text-[11px] font-medium text-slate-300 shadow-md">
              <span className={`size-2 rounded-full ${media.micEnabled ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
              <span>{media.micEnabled ? "Mic Ready" : "Mic Muted"}</span>
            </div>

            {/* Camera & Mic Quick Controls Bar */}
            <div className="absolute bottom-4 left-1/2 flex -translate-x-1/2 items-center gap-3 rounded-full bg-slate-900/90 backdrop-blur-md px-4 py-2 border border-slate-800 shadow-2xl">
              <Button
                type="button"
                size="icon"
                variant={media.micEnabled ? "secondary" : "destructive"}
                className={`size-10 rounded-full transition-all shadow-md ${
                  media.micEnabled
                    ? "bg-slate-800 text-white hover:bg-slate-700 border border-slate-700"
                    : "bg-red-600 text-white hover:bg-red-700 border border-red-500"
                }`}
                aria-label={media.micEnabled ? "Mute microphone" : "Unmute microphone"}
                onClick={media.toggleMic}
              >
                {media.micEnabled ? <Mic className="size-4" /> : <MicOff className="size-4" />}
              </Button>

              <Button
                type="button"
                size="icon"
                variant={media.cameraEnabled ? "secondary" : "destructive"}
                className={`size-10 rounded-full transition-all shadow-md ${
                  media.cameraEnabled
                    ? "bg-slate-800 text-white hover:bg-slate-700 border border-slate-700"
                    : "bg-red-600 text-white hover:bg-red-700 border border-red-500"
                }`}
                aria-label={media.cameraEnabled ? "Turn camera off" : "Turn camera on"}
                onClick={media.toggleCamera}
              >
                {media.cameraEnabled ? <Video className="size-4" /> : <VideoOff className="size-4" />}
              </Button>
            </div>
          </div>

          {/* Device Selection Pickers */}
          <div className="grid gap-3.5 rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur-md sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="camera-select" className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Camera className="size-3.5 text-cyan-400" /> Camera Device
              </Label>
              <Select disabled={media.devices.cameras.length === 0}>
                <SelectTrigger id="camera-select" className="h-9 border-slate-800 bg-slate-950 text-xs text-slate-200 focus:ring-cyan-500/50">
                  <SelectValue placeholder={media.devices.cameras[0]?.label || "Default camera"} />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-slate-900 text-slate-200">
                  {media.devices.cameras.map((d, i) => (
                    <SelectItem key={d.deviceId || i} value={d.deviceId || String(i)} className="text-xs focus:bg-slate-800">
                      {d.label || `Camera ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="mic-select" className="flex items-center gap-1.5 text-xs font-semibold text-slate-300">
                <Volume2 className="size-3.5 text-cyan-400" /> Microphone Device
              </Label>
              <Select disabled={media.devices.microphones.length === 0}>
                <SelectTrigger id="mic-select" className="h-9 border-slate-800 bg-slate-950 text-xs text-slate-200 focus:ring-cyan-500/50">
                  <SelectValue placeholder={media.devices.microphones[0]?.label || "Default microphone"} />
                </SelectTrigger>
                <SelectContent className="border-slate-800 bg-slate-900 text-slate-200">
                  {media.devices.microphones.map((d, i) => (
                    <SelectItem key={d.deviceId || i} value={d.deviceId || String(i)} className="text-xs focus:bg-slate-800">
                      {d.label || `Microphone ${i + 1}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {/* Right Column: User Join Form Card */}
        <form
          onSubmit={submit}
          className="flex flex-col gap-5 rounded-2xl border border-slate-800/90 bg-gradient-to-b from-slate-900 via-slate-900/95 to-slate-950 p-6 shadow-2xl backdrop-blur-xl"
        >
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-cyan-500/10 px-2.5 py-1 text-[11px] font-semibold text-cyan-400 ring-1 ring-cyan-500/20">
              <ShieldCheck className="size-3.5" /> Secure Room Entry
            </span>
            <h2 className="mt-3 text-lg font-bold text-white">Join Meeting</h2>
            <p className="mt-1 text-xs text-slate-400">
              Enter your display name to enter the call.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="display-name" className="text-xs font-semibold text-slate-300">
              Your Display Name
            </Label>
            <Input
              id="display-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Alex Morgan"
              readOnly={nameLocked}
              aria-invalid={Boolean(error)}
              maxLength={60}
              autoFocus={!nameLocked}
              className="h-11 border-slate-800 bg-slate-950 px-3.5 text-sm font-medium text-white placeholder:text-slate-600 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
            {error ? (
              <p role="alert" className="text-xs font-medium text-red-400">
                {error}
              </p>
            ) : (
              <p className="text-[11px] text-slate-500">
                {nameLocked
                  ? "Connected with your signed-in MeetSpace profile."
                  : "Visible to all meeting participants."}
              </p>
            )}
          </div>

          <Button
            type="submit"
            disabled={joining}
            className="mt-2 h-11 w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 font-semibold text-white shadow-lg transition-all hover:from-cyan-400 hover:to-blue-500 hover:shadow-cyan-500/25 active:scale-[0.99] disabled:opacity-50"
          >
            {joining ? (
              <span className="flex items-center gap-2">
                <span className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Joining Call…
              </span>
            ) : (
              "Join Meeting Now"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
