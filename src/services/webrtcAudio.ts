import { PipecatClient, RTVIEvent, type RTVIMessage, type Participant } from '@pipecat-ai/client-js';
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport';
import { BOT_START_URL, BOT_START_PUBLIC_API_KEY, ICE_SERVERS } from '../config/settings';
import { buildMicConstraints } from './voiceConstants';

export interface WebRTCAudioCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onTurnComplete?: () => void;
  onVoiceActivity?: (isActive: boolean) => void;
  onBotStartedSpeaking?: () => void;
  onBotStoppedSpeaking?: () => void;
}

export interface WebRTCConnectOptions {
  fullVoiceMode?: boolean;
  pushToTalkMode?: boolean;
  deviceId?: string;
  /** Mic on at connect time (full voice). PTT keeps mic off until enableMic(true). */
  enableMicInitially?: boolean;
}

export class WebRTCAudioService {
  private client: PipecatClient | null = null;
  private transport: SmallWebRTCTransport | null = null;
  private isConnected = false;
  private callbacks: WebRTCAudioCallbacks | null = null;

  async connect(
    selectedLanguage: string,
    callbacks: WebRTCAudioCallbacks,
    options: WebRTCConnectOptions = {},
  ): Promise<void> {
    const {
      fullVoiceMode = false,
      pushToTalkMode = false,
      deviceId,
      enableMicInitially = fullVoiceMode,
    } = options;

    try {
      this.callbacks = callbacks;

      // Prime mic with AEC/noise suppression before Pipecat acquires the track
      try {
        const warmStream = await navigator.mediaDevices.getUserMedia({
          audio: buildMicConstraints(deviceId),
        });
        warmStream.getTracks().forEach((t) => t.stop());
      } catch (micErr) {
        console.warn('[WebRTC] Mic constraint warmup failed, continuing:', micErr);
      }

      this.transport = new SmallWebRTCTransport({
        iceServers: ICE_SERVERS,
      });

      this.client = new PipecatClient({
        transport: this.transport,
        enableMic: enableMicInitially,
        enableCam: false,
        callbacks: {
          onConnected: () => {
            this.isConnected = true;
            callbacks.onConnected();
          },
          onDisconnected: () => {
            this.isConnected = false;
            callbacks.onDisconnected();
          },
          onUserTranscript: (data: { text?: string; final?: boolean }) => {
            if (data.text && data.text.trim()) {
              callbacks.onTranscript(data.text, data.final || false);
              if (fullVoiceMode && data.final && callbacks.onTurnComplete) {
                callbacks.onTurnComplete();
              }
            }
          },
          onError: (error: RTVIMessage) => {
            callbacks.onError(new Error(String(error)));
          },
          onBotStartedSpeaking: () => {
            callbacks.onBotStartedSpeaking?.();
          },
          onBotStoppedSpeaking: () => {
            callbacks.onBotStoppedSpeaking?.();
          },
        },
      });

      this.setupAudioTracks();

      const connectParams: Record<string, unknown> = {
        endpoint: BOT_START_URL,
        requestData: {
          createDailyRoom: false,
          enableDefaultIceServers: false,
          transport: 'webrtc',
          language: selectedLanguage,
          full_voice_mode: fullVoiceMode,
          push_to_talk_mode: pushToTalkMode,
        },
      };

      if (BOT_START_PUBLIC_API_KEY) {
        connectParams.headers = new Headers({
          Authorization: `Bearer ${BOT_START_PUBLIC_API_KEY}`,
        });
      }

      await this.client.connect(connectParams as Parameters<PipecatClient['connect']>[0]);
    } catch (error) {
      console.error('WebRTC connection error:', error);
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
      throw error;
    }
  }

  private setupAudioTracks(): void {
    if (!this.client) return;

    let botAudioElement: HTMLAudioElement | null = null;

    this.client.on(RTVIEvent.TrackStarted, (track: MediaStreamTrack, participant?: Participant) => {
      if (!participant?.local && track.kind === 'audio') {
        botAudioElement = document.createElement('audio');
        botAudioElement.autoplay = true;
        botAudioElement.srcObject = new MediaStream([track]);
        document.body.appendChild(botAudioElement);
        void botAudioElement.play().catch((err) => {
          console.warn('[WebRTC] Bot audio autoplay blocked:', err);
        });
        (this.client as PipecatClient & { _botAudioElement?: HTMLAudioElement })._botAudioElement =
          botAudioElement;
      }
    });

    this.client.on(RTVIEvent.UserStartedSpeaking, () => {
      this.callbacks?.onVoiceActivity?.(true);
      if (botAudioElement && !botAudioElement.paused) {
        botAudioElement.pause();
        botAudioElement.currentTime = 0;
      }
    });

    this.client.on(RTVIEvent.UserStoppedSpeaking, () => {
      this.callbacks?.onVoiceActivity?.(false);
    });
  }

  /** Stream TTS through the WebRTC pipeline (low-latency). */
  speakText(text: string, interrupt = true): void {
    if (!this.client || !text.trim()) return;
    this.client.sendClientMessage('speak-tts', { text: text.trim(), interrupt });
  }

  /** Interrupt in-flight pipeline TTS. */
  interruptPipelineTTS(): void {
    this.client?.sendClientMessage('interrupt-tts', {});
    this.interruptBotAudio();
  }

  interruptBotAudio(): void {
    if (this.client) {
      const el = (this.client as PipecatClient & { _botAudioElement?: HTMLAudioElement })
        ._botAudioElement;
      if (el && !el.paused) {
        el.pause();
        el.currentTime = 0;
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      const el = (this.client as PipecatClient & { _botAudioElement?: HTMLAudioElement })
        ._botAudioElement;
      if (el) {
        el.pause();
        el.remove();
      }
      await this.client.disconnect();
      this.client = null;
    }
    if (this.transport) {
      this.transport = null;
    }
    this.isConnected = false;
  }

  enableMic(enabled: boolean): void {
    if (this.client) {
      this.client.enableMic(enabled);
    }
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }
}
