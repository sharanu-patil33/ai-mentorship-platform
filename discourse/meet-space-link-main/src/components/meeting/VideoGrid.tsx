import type { MediaParticipant } from "@/types";
import { ParticipantTile } from "./ParticipantTile";

interface VideoGridProps {
  participants?: MediaParticipant[];
  localStream?: MediaStream | null;
  localMicMuted?: boolean;
  localCamMuted?: boolean;
  localHandRaised?: boolean;
  localScreenSharing?: boolean;
  localDisplayName?: string;
  peers?: Array<{ peerId: string; stream: MediaStream; state: string }>;
  speakerId?: string | null;
}

export function VideoGrid(props: VideoGridProps) {
  let list: MediaParticipant[] = props.participants || [];

  if (!props.participants && (props.localStream !== undefined || props.peers !== undefined)) {
    // Construct participant list with ALL alias fields (displayName, cameraEnabled, micEnabled)
    const localPart: MediaParticipant = {
      id: "local_user",
      name: props.localDisplayName || "You",
      displayName: props.localDisplayName || "You",
      audioMuted: Boolean(props.localMicMuted),
      micEnabled: !props.localMicMuted,
      videoMuted: Boolean(props.localCamMuted),
      cameraEnabled: !props.localCamMuted,
      handRaised: Boolean(props.localHandRaised),
      screenSharing: Boolean(props.localScreenSharing),
      stream: props.localStream || undefined,
      isLocal: true,
    };

    const peerParts: MediaParticipant[] = (props.peers || []).map((peer) => ({
      id: peer.peerId,
      name: `Participant (${peer.peerId.slice(0, 4)})`,
      displayName: `Participant (${peer.peerId.slice(0, 4)})`,
      audioMuted: false,
      micEnabled: true,
      videoMuted: false,
      cameraEnabled: true,
      handRaised: false,
      screenSharing: false,
      stream: peer.stream,
      isLocal: false,
    }));

    list = [localPart, ...peerParts];
  }

  const activePresenter = list.find((p) => p.screenSharing);

  if (activePresenter) {
    const others = list.filter((p) => p.id !== activePresenter.id);
    return (
      <div className="flex h-full flex-col gap-3 p-3 lg:flex-row min-h-0 flex-1">
        {/* Main Stage: Shared Screen */}
        <div className="min-h-0 flex-1">
          <ParticipantTile participant={activePresenter} isStage />
        </div>
        {/* Side Rail: Participant Webcams */}
        {others.length > 0 ? (
          <div className="flex shrink-0 gap-3 overflow-x-auto lg:w-72 lg:flex-col lg:overflow-y-auto">
            {others.map((p) => (
              <div key={p.id} className="w-48 shrink-0 lg:w-full">
                <ParticipantTile participant={p} />
              </div>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid flex-1 h-full min-h-0 auto-rows-fr grid-cols-1 gap-3 overflow-y-auto p-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-2">
      {list.map((participant) => (
        <ParticipantTile key={participant.id} participant={participant} />
      ))}
    </div>
  );
}