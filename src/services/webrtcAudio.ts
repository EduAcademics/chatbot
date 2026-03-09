import { PipecatClient, RTVIEvent, type RTVIMessage, type Participant } from '@pipecat-ai/client-js';
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport';

const BOT_START_URL = import.meta.env.VITE_BOT_START_URL || 'http://localhost:7860/start';
const BOT_START_PUBLIC_API_KEY = import.meta.env.VITE_BOT_START_PUBLIC_API_KEY;

export interface WebRTCAudioCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
  onConnected: () => void;
  onDisconnected: () => void;
  onTurnComplete?: () => void;
  onVoiceActivity?: (isActive: boolean) => void;
}

export class WebRTCAudioService {
  private client: PipecatClient | null = null;
  private transport: SmallWebRTCTransport | null = null;
  private isConnected = false;
  private callbacks: WebRTCAudioCallbacks | null = null;

  async connect(
    selectedLanguage: string,
    callbacks: WebRTCAudioCallbacks,
    fullVoiceMode = false
  ): Promise<void> {
    try {
      this.callbacks = callbacks;

      // Create transport
      //this.transport = new SmallWebRTCTransport();
      // Create transport WITH ICE servers
this.transport = new SmallWebRTCTransport({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },

      // TURN server (replace with your real values)
      {
        urls: "turn:aiapi.eduacademics.com:3478",
        username: "webrtc",
        credential: "webrtcpass"
      }
    ]
});


      // Create client
      this.client = new PipecatClient({
        transport: this.transport,
        enableMic: true,
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
                setTimeout(() => callbacks.onTurnComplete!(), 100);
              }
            }
          },
          onError: (error: RTVIMessage) => {
            callbacks.onError(new Error(String(error)));
          },
        },
      });

      this.setupAudioTracks();

      const connectParams: any = {
        endpoint: BOT_START_URL,
        requestData: {
          createDailyRoom: false,
          enableDefaultIceServers: false,
          transport: 'webrtc',
          language: selectedLanguage,
          full_voice_mode: fullVoiceMode,
        },
      };

      if (BOT_START_PUBLIC_API_KEY) {
        connectParams.headers = new Headers({
          Authorization: `Bearer ${BOT_START_PUBLIC_API_KEY}`,
        });
      }

      await this.client.connect(connectParams);
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
        (this.client as any)._botAudioElement = botAudioElement;
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

  interruptBotAudio(): void {
    if (this.client) {
      const el = (this.client as any)._botAudioElement;
      if (el && !el.paused) {
        el.pause();
        el.currentTime = 0;
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
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
