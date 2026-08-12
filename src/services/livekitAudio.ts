import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
  type Participant,
} from 'livekit-client';
import { API_BASE_URL } from '../config/settings';
import { buildMicConstraints } from './voiceConstants';

/** Shared callback contract used by useChatbot (WebRTC + LiveKit). */
export interface VoiceAudioCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onTurnComplete?: () => void;
  onVoiceActivity?: (isActive: boolean) => void;
  onBotStartedSpeaking?: () => void;
  onBotStoppedSpeaking?: () => void;
}

export interface VoiceConnectOptions {
  fullVoiceMode?: boolean;
  pushToTalkMode?: boolean;
  deviceId?: string;
  /** Mic on at connect time (full voice). PTT keeps mic off until enableMic(true). */
  enableMicInitially?: boolean;
}

/** @deprecated Use VoiceAudioCallbacks */
export type WebRTCAudioCallbacks = VoiceAudioCallbacks;
/** @deprecated Use VoiceConnectOptions */
export type WebRTCConnectOptions = VoiceConnectOptions;

interface VoiceSessionResponse {
  status: string;
  data: {
    url: string;
    token: string;
    roomName: string;
  };
}

/**
 * LiveKit-backed voice transport with the same public API as WebRTCAudioService
 * so useChatbot PTT / TTS / pre-warm paths stay unchanged.
 */
export class LiveKitAudioService {
  private room: Room | null = null;
  private isConnected = false;
  private callbacks: VoiceAudioCallbacks | null = null;
  private botAudioElement: HTMLAudioElement | null = null;
  private fullVoiceMode = false;

  async connect(
    selectedLanguage: string,
    callbacks: VoiceAudioCallbacks,
    options: VoiceConnectOptions = {},
  ): Promise<void> {
    const {
      fullVoiceMode = false,
      pushToTalkMode = true,
      deviceId,
      enableMicInitially = fullVoiceMode,
    } = options;

    this.callbacks = callbacks;
    this.fullVoiceMode = fullVoiceMode;

    try {
      // Prime mic permissions / constraints before LiveKit acquires the track.
      try {
        const warmStream = await navigator.mediaDevices.getUserMedia({
          audio: buildMicConstraints(deviceId),
        });
        warmStream.getTracks().forEach((t) => t.stop());
      } catch (micErr) {
        console.warn('[LiveKit] Mic constraint warmup failed, continuing:', micErr);
      }

      const session = await this.createSession({
        language: selectedLanguage,
        fullVoiceMode,
        pushToTalkMode,
      });

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
          deviceId: deviceId && deviceId !== 'default' ? deviceId : undefined,
        },
      });
      this.room = room;
      this.bindRoomEvents(room);

      await room.connect(session.url, session.token);
      await room.localParticipant.setMicrophoneEnabled(!!enableMicInitially);
      await this.waitForRemoteParticipant(room, 45_000);

      this.isConnected = true;
      callbacks.onConnected();
    } catch (error) {
      console.error('LiveKit connection error:', error);
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      await this.disconnect();
      throw error;
    }
  }

  /** Bot subprocess can take several seconds to import Pipecat and join. */
  private waitForRemoteParticipant(room: Room, timeoutMs: number): Promise<void> {
    if (room.remoteParticipants.size > 0) {
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error('Timed out waiting for voice bot to join LiveKit room'));
      }, timeoutMs);

      const onJoin = () => {
        cleanup();
        resolve();
      };

      const cleanup = () => {
        clearTimeout(timer);
        room.off(RoomEvent.ParticipantConnected, onJoin);
      };

      room.on(RoomEvent.ParticipantConnected, onJoin);
      if (room.remoteParticipants.size > 0) {
        cleanup();
        resolve();
      }
    });
  }

  private async createSession(opts: {
    language: string;
    fullVoiceMode: boolean;
    pushToTalkMode: boolean;
  }): Promise<VoiceSessionResponse['data']> {
    const response = await fetch(`${API_BASE_URL}/v1/ai/voice-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        language: opts.language,
        full_voice_mode: opts.fullVoiceMode,
        push_to_talk_mode: opts.pushToTalkMode,
      }),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `Voice session failed (${response.status}): ${detail || response.statusText}`,
      );
    }
    const json = (await response.json()) as VoiceSessionResponse;
    if (!json?.data?.url || !json?.data?.token) {
      throw new Error('Voice session response missing url/token');
    }
    return json.data;
  }

  private bindRoomEvents(room: Room): void {
    room.on(
      RoomEvent.TrackSubscribed,
      (
        track: RemoteTrack,
        _publication: RemoteTrackPublication,
        participant: RemoteParticipant,
      ) => {
        if (track.kind !== Track.Kind.Audio) return;
        if (participant.isLocal) return;
        this.attachRemoteAudio(track);
      },
    );

    room.on(RoomEvent.DataReceived, (payload: Uint8Array, participant?: Participant) => {
      if (participant?.isLocal) return;
      this.handleDataMessage(payload);
    });

    room.on(RoomEvent.Disconnected, () => {
      this.isConnected = false;
      this.callbacks?.onDisconnected();
    });

    room.on(RoomEvent.MediaDevicesError, (error: Error) => {
      this.callbacks?.onError(error);
    });
  }

  private attachRemoteAudio(track: RemoteTrack): void {
    if (!this.botAudioElement) {
      this.botAudioElement = document.createElement('audio');
      this.botAudioElement.autoplay = true;
      this.botAudioElement.setAttribute('playsinline', 'true');
      document.body.appendChild(this.botAudioElement);
    }
    track.attach(this.botAudioElement);
    void this.botAudioElement.play().catch((err) => {
      console.warn('[LiveKit] Bot audio autoplay blocked (will retry on gesture):', err);
    });
  }

  private handleDataMessage(payload: Uint8Array): void {
    let message: { type?: string; data?: Record<string, unknown> };
    try {
      const text = new TextDecoder().decode(payload);
      message = JSON.parse(text);
    } catch {
      return;
    }

    const type = message.type;
    const data = message.data || {};

    switch (type) {
      case 'transcript': {
        const transcript = String(data.text || '').trim();
        if (!transcript) return;
        const isFinal = Boolean(data.final);
        this.callbacks?.onTranscript(transcript, isFinal);
        if (this.fullVoiceMode && isFinal) {
          this.callbacks?.onTurnComplete?.();
        }
        break;
      }
      case 'user-started-speaking': {
        this.callbacks?.onVoiceActivity?.(true);
        if (this.botAudioElement && !this.botAudioElement.paused) {
          this.botAudioElement.pause();
          this.botAudioElement.currentTime = 0;
        }
        break;
      }
      case 'user-stopped-speaking': {
        this.callbacks?.onVoiceActivity?.(false);
        break;
      }
      case 'bot-started-speaking': {
        this.callbacks?.onBotStartedSpeaking?.();
        break;
      }
      case 'bot-stopped-speaking': {
        this.callbacks?.onBotStoppedSpeaking?.();
        break;
      }
      case 'error': {
        const msg = String(data.message || 'LiveKit voice error');
        this.callbacks?.onError(new Error(msg));
        break;
      }
      default:
        break;
    }
  }

  private sendClientMessage(type: string, data: Record<string, unknown> = {}): void {
    if (!this.room || this.room.state !== ConnectionState.Connected) return;
    const payload = new TextEncoder().encode(JSON.stringify({ type, data }));
    void this.room.localParticipant
      .publishData(payload, { reliable: true })
      .catch((err) => {
        console.warn('[LiveKit] publishData failed:', err);
      });
  }

  resumeBotAudio(): void {
    const el = this.botAudioElement;
    if (!el) return;
    if (el.paused) {
      void el.play().catch((err) => {
        console.warn('[LiveKit] resumeBotAudio play() failed:', err);
      });
    }
  }

  speakText(text: string, interrupt = true): void {
    if (!text.trim()) return;
    this.sendClientMessage('speak-tts', { text: text.trim(), interrupt });
  }

  interruptPipelineTTS(): void {
    this.sendClientMessage('interrupt-tts', {});
    this.interruptBotAudio();
  }

  interruptBotAudio(): void {
    const el = this.botAudioElement;
    if (el && !el.paused) {
      el.pause();
      el.currentTime = 0;
    }
  }

  async disconnect(): Promise<void> {
    if (this.botAudioElement) {
      this.botAudioElement.pause();
      this.botAudioElement.srcObject = null;
      this.botAudioElement.remove();
      this.botAudioElement = null;
    }
    if (this.room) {
      try {
        await this.room.disconnect();
      } catch {
        /* ignore */
      }
      this.room = null;
    }
    this.isConnected = false;
  }

  enableMic(enabled: boolean): void {
    if (this.room) {
      void this.room.localParticipant.setMicrophoneEnabled(enabled).catch((err) => {
        console.warn('[LiveKit] setMicrophoneEnabled failed:', err);
      });
    }
  }

  getIsConnected(): boolean {
    return this.isConnected && this.room?.state === ConnectionState.Connected;
  }
}
