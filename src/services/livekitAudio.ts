import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
} from 'livekit-client';
import { API_BASE_URL } from '../config/settings';
import { buildMicConstraints } from './voiceConstants';
import type { WebRTCAudioCallbacks, WebRTCConnectOptions } from './webrtcAudio';

const RTVI_MESSAGE_LABEL = 'rtvi-ai';

interface LivekitTokenResponse {
  url: string;
  token: string;
  room_name: string;
}

interface RtviMessage {
  label?: string;
  type: string;
  id?: string;
  data?: Record<string, unknown>;
}

function createRtviMessage(type: string, data?: unknown): RtviMessage {
  return {
    label: RTVI_MESSAGE_LABEL,
    type,
    id: crypto.randomUUID(),
    data: data as Record<string, unknown> | undefined,
  };
}

export class LiveKitAudioService {
  private room: Room | null = null;
  private callbacks: WebRTCAudioCallbacks | null = null;
  private isConnected = false;
  private botAudioElement: HTMLAudioElement | null = null;
  private fullVoiceMode = false;
  private connectOptions: WebRTCConnectOptions = {};

  private async fetchToken(
    identity: string,
    sessionId: string | undefined,
    selectedLanguage: string,
    options: WebRTCConnectOptions,
  ): Promise<LivekitTokenResponse> {
    const response = await fetch(`${API_BASE_URL}/v1/voice/livekit-token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identity,
        session_id: sessionId,
        language: selectedLanguage,
        full_voice_mode: options.fullVoiceMode ?? false,
        push_to_talk_mode: options.pushToTalkMode ?? false,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(
        `LiveKit token request failed (${response.status}): ${detail}`,
      );
    }

    return response.json() as Promise<LivekitTokenResponse>;
  }

  private ensureBotAudioElement(): HTMLAudioElement {
    if (!this.botAudioElement) {
      this.botAudioElement = document.createElement('audio');
      this.botAudioElement.autoplay = true;
      this.botAudioElement.setAttribute('playsinline', 'true');
      document.body.appendChild(this.botAudioElement);
    }
    return this.botAudioElement;
  }

  private attachRemoteAudio(track: MediaStreamTrack): void {
    const el = this.ensureBotAudioElement();
    el.srcObject = new MediaStream([track]);
    void el.play().catch((err) => {
      console.warn('[LiveKit] Bot audio autoplay blocked (will retry on gesture):', err);
    });
  }

  private async publishRtviMessage(message: RtviMessage): Promise<void> {
    const room = this.room;
    if (!room || room.state !== ConnectionState.Connected) return;
    const payload = new TextEncoder().encode(JSON.stringify(message));
    await room.localParticipant.publishData(payload, { reliable: true });
  }

  private sendClientMessage(msgType: string, data: Record<string, unknown>): void {
    void this.publishRtviMessage(
      createRtviMessage('client-message', { t: msgType, d: data }),
    );
  }

  private handleRtviMessage(message: RtviMessage): void {
    const callbacks = this.callbacks;
    if (!callbacks || message.label !== RTVI_MESSAGE_LABEL) return;

    switch (message.type) {
      case 'user-transcription': {
        const data = message.data as
          | { text?: string; final?: boolean }
          | undefined;
        const text = data?.text?.trim();
        if (!text) return;
        const isFinal = Boolean(data?.final);
        callbacks.onTranscript(text, isFinal);
        if (this.fullVoiceMode && isFinal) {
          callbacks.onTurnComplete?.();
        }
        break;
      }
      case 'user-started-speaking':
        callbacks.onVoiceActivity?.(true);
        if (this.botAudioElement && !this.botAudioElement.paused) {
          this.botAudioElement.pause();
          this.botAudioElement.currentTime = 0;
        }
        break;
      case 'user-stopped-speaking':
        callbacks.onVoiceActivity?.(false);
        break;
      case 'bot-started-speaking':
        callbacks.onBotStartedSpeaking?.();
        break;
      case 'bot-stopped-speaking':
        callbacks.onBotStoppedSpeaking?.();
        break;
      case 'error': {
        const data = message.data as { message?: string } | undefined;
        callbacks.onError(
          new Error(data?.message || 'LiveKit voice pipeline error'),
        );
        break;
      }
      default:
        break;
    }
  }

  private setupRoomHandlers(room: Room): void {
    room.on(RoomEvent.Connected, () => {
      this.isConnected = true;
      this.callbacks?.onConnected();
      void this.publishRtviMessage(
        createRtviMessage('client-ready', {
          version: '1.0.0',
          about: {
            library: 'livekit-client',
            platform: navigator.platform,
          },
        }),
      );
    });

    room.on(RoomEvent.Disconnected, () => {
      this.isConnected = false;
      this.callbacks?.onDisconnected();
    });

    room.on(RoomEvent.Reconnecting, () => {
      this.isConnected = false;
    });

    room.on(RoomEvent.Reconnected, () => {
      this.isConnected = true;
      this.callbacks?.onConnected();
    });

    room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
      if (participant.isLocal || track.kind !== Track.Kind.Audio) return;
      this.attachRemoteAudio(track.mediaStreamTrack);
    });

    room.on(RoomEvent.DataReceived, (payload) => {
      try {
        const text = new TextDecoder().decode(payload);
        const message = JSON.parse(text) as RtviMessage;
        this.handleRtviMessage(message);
      } catch (err) {
        console.warn('[LiveKit] Failed to parse data message:', err);
      }
    });

    room.on(RoomEvent.MediaDevicesError, (error) => {
      this.callbacks?.onError(error);
    });
  }

  async connect(
    selectedLanguage: string,
    callbacks: WebRTCAudioCallbacks,
    options: WebRTCConnectOptions = {},
  ): Promise<void> {
    const {
      fullVoiceMode = false,
      deviceId,
      enableMicInitially = fullVoiceMode,
      identity,
      sessionId,
    } = options;

    const participantIdentity = identity?.trim();
    if (!participantIdentity) {
      throw new Error('LiveKit connect requires identity (user id)');
    }

    try {
      this.callbacks = callbacks;
      this.fullVoiceMode = fullVoiceMode;
      this.connectOptions = options;

      try {
        const warmStream = await navigator.mediaDevices.getUserMedia({
          audio: buildMicConstraints(deviceId),
        });
        warmStream.getTracks().forEach((t) => t.stop());
      } catch (micErr) {
        console.warn('[LiveKit] Mic constraint warmup failed, continuing:', micErr);
      }

      const { url, token } = await this.fetchToken(
        participantIdentity,
        sessionId,
        selectedLanguage,
        options,
      );

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      this.room = room;
      this.setupRoomHandlers(room);

      await room.connect(url, token, {
        autoSubscribe: true,
      });

      await room.localParticipant.setMicrophoneEnabled(enableMicInitially, {
        deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
      });
    } catch (error) {
      console.error('LiveKit connection error:', error);
      this.isConnected = false;
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
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
      await this.room.disconnect();
      this.room = null;
    }
    this.isConnected = false;
  }

  enableMic(enabled: boolean): void {
    const room = this.room;
    if (!room || room.state !== ConnectionState.Connected) return;
    const deviceId = this.connectOptions.deviceId;
    void room.localParticipant.setMicrophoneEnabled(enabled, {
      deviceId: deviceId && deviceId !== 'default' ? { exact: deviceId } : undefined,
    });
  }

  getIsConnected(): boolean {
    return this.isConnected && this.room?.state === ConnectionState.Connected;
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

  resumeBotAudio(): void {
    const el = this.botAudioElement;
    if (!el || !el.srcObject) return;
    if (el.paused) {
      void el.play().catch((err) => {
        console.warn('[LiveKit] resumeBotAudio play() failed:', err);
      });
    }
  }
}
