/**
 * Minimal mesh WebRTC orchestrator for multi-party peer connections.
 */

export type PeerConnectionState =
  | "new"
  | "connecting"
  | "connected"
  | "disconnected"
  | "failed"
  | "closed";

export interface MeshPeer {
  peerId: string;
  stream: MediaStream | null;
  state: PeerConnectionState;
  audioMuted: boolean;
  videoMuted: boolean;
}

export type SignalHandler = (targetId: string, signal: any) => void;
export type PeersHandler = (peers: MeshPeer[]) => void;

const STUN_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export class Mesh {
  private peers = new Map<
    string,
    {
      pc: RTCPeerConnection;
      remoteStream: MediaStream;
      state: PeerConnectionState;
      audioSender?: RTCRtpSender;
      videoSender?: RTCRtpSender;
    }
  >();

  private audioTrack: MediaStreamTrack | null = null;
  private videoTrack: MediaStreamTrack | null = null;

  constructor(
    private opts: {
      onSignalNeeded?: SignalHandler;
      onPeersChanged?: PeersHandler;
      peerId?: string;
      getLocalStream?: () => MediaStream | null;
      onPeersChange?: PeersHandler;
    },
  ) {}

  setAudioTrack(track: MediaStreamTrack | null) {
    this.audioTrack = track;
    this.updateSenders();
  }

  setVideoTrack(track: MediaStreamTrack | null) {
    this.videoTrack = track;
    this.updateSenders();
  }

  setLocalTracks(audio: MediaStreamTrack | null, video: MediaStreamTrack | null) {
    this.audioTrack = audio;
    this.videoTrack = video;
    this.updateSenders();
  }

  private updateSenders() {
    for (const entry of this.peers.values()) {
      if (this.audioTrack) {
        if (entry.audioSender) {
          void entry.audioSender.replaceTrack(this.audioTrack);
        } else {
          entry.audioSender = entry.pc.addTrack(this.audioTrack, entry.remoteStream);
        }
      }
      if (this.videoTrack) {
        if (entry.videoSender) {
          void entry.videoSender.replaceTrack(this.videoTrack);
        } else {
          entry.videoSender = entry.pc.addTrack(this.videoTrack, entry.remoteStream);
        }
      }
    }
  }

  private createPeerConnection(targetId: string) {
    const pc = new RTCPeerConnection(STUN_SERVERS);
    const remoteStream = new MediaStream();

    if (this.audioTrack) {
      try {
        pc.addTrack(this.audioTrack, remoteStream);
      } catch {
        /* best effort */
      }
    }
    if (this.videoTrack) {
      try {
        pc.addTrack(this.videoTrack, remoteStream);
      } catch {
        /* best effort */
      }
    }

    pc.ontrack = (evt) => {
      if (evt.track) {
        remoteStream.addTrack(evt.track);
        this.emit();
      }
    };

    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        const handler = this.opts.onSignalNeeded;
        if (typeof handler === "function") {
          handler(targetId, { type: "candidate", kind: "ice", candidate: evt.candidate });
        }
      }
    };

    pc.onconnectionstatechange = () => {
      const entry = this.peers.get(targetId);
      if (entry) {
        entry.state = pc.connectionState as PeerConnectionState;
        this.emit();
      }
    };

    return {
      pc,
      remoteStream,
      state: "new" as PeerConnectionState,
    };
  }

  async addPeer(targetId: string, isInitiator = true) {
    if (this.peers.has(targetId)) return;
    const entry = this.createPeerConnection(targetId);
    this.peers.set(targetId, entry);

    if (isInitiator) {
      try {
        const offer = await entry.pc.createOffer();
        await entry.pc.setLocalDescription(offer);
        const handler = this.opts.onSignalNeeded;
        if (typeof handler === "function") {
          handler(targetId, { type: "offer", kind: "offer", sdp: offer });
        }
      } catch (err) {
        console.warn(`Failed creating offer for peer ${targetId}:`, err);
      }
    }

    this.emit();
  }

  async handleSignal(senderId: string, signal: any) {
    let entry = this.peers.get(senderId);

    if (!entry) {
      entry = this.createPeerConnection(senderId);
      this.peers.set(senderId, entry);
    }

    const pc = entry.pc;

    try {
      const sigType = signal.type || signal.kind;
      if (sigType === "offer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        const handler = this.opts.onSignalNeeded;
        if (typeof handler === "function") {
          handler(senderId, { type: "answer", kind: "answer", sdp: answer });
        }
      } else if (sigType === "answer") {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
      } else if ((sigType === "candidate" || sigType === "ice") && signal.candidate) {
        await pc.addIceCandidate(new RTCIceCandidate(signal.candidate));
      }
    } catch (err) {
      console.warn(`Signal handling error from ${senderId}:`, err);
    }

    this.emit();
  }

  removePeer(targetId: string) {
    const entry = this.peers.get(targetId);
    if (entry) {
      entry.pc.close();
      this.peers.delete(targetId);
      this.emit();
    }
  }

  getPeers(): MeshPeer[] {
    const list: MeshPeer[] = [];
    for (const [peerId, entry] of this.peers.entries()) {
      const tracks = entry.remoteStream.getTracks();
      const audioTrack = entry.remoteStream.getAudioTracks()[0];
      const videoTrack = entry.remoteStream.getVideoTracks()[0];

      list.push({
        peerId,
        stream: tracks.length > 0 ? entry.remoteStream : null,
        state: entry.state,
        audioMuted: audioTrack ? !audioTrack.enabled : true,
        videoMuted: videoTrack ? !videoTrack.enabled : true,
      });
    }
    return list;
  }

  close() {
    for (const entry of this.peers.values()) {
      entry.pc.close();
    }
    this.peers.clear();
    this.emit();
  }

  destroy() {
    this.close();
  }

  updateStream(stream: MediaStream | null) {
    if (!stream) return;
    const audio = stream.getAudioTracks()[0] || null;
    const video = stream.getVideoTracks()[0] || null;
    this.setLocalTracks(audio, video);
  }

  private emit() {
    try {
      const handler = this.opts.onPeersChanged || this.opts.onPeersChange;
      if (typeof handler === "function") {
        handler(this.getPeers());
      }
    } catch (err) {
      console.warn("Notice in Mesh emit:", err);
    }
  }
}
