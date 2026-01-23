import { PipecatClient, RTVIEvent } from '@pipecat-ai/client-js';
import { SmallWebRTCTransport } from '@pipecat-ai/small-webrtc-transport';

const BOT_START_URL = import.meta.env.VITE_BOT_START_URL || 'http://localhost:7860/start';
const BOT_START_PUBLIC_API_KEY = import.meta.env.VITE_BOT_START_PUBLIC_API_KEY;

export interface WebRTCAudioCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}

export class WebRTCAudioService {
  private client: PipecatClient | null = null;
  private transport: SmallWebRTCTransport | null = null;
  private isConnected = false;
  private callbacks: WebRTCAudioCallbacks | null = null;

  async connect(
    selectedLanguage: string,
    callbacks: WebRTCAudioCallbacks
  ): Promise<void> {
    try {
      this.callbacks = callbacks;

      // Create transport
      this.transport = new SmallWebRTCTransport();

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
          onUserTranscript: (data) => {
            // Process both interim and final transcripts for lower latency
            // Interim results appear faster, final results are more accurate
            if (data.text && data.text.trim()) {
              // Pass the final flag so the handler can distinguish interim vs final
              callbacks.onTranscript(data.text, data.final || false);
            }
          },
          onError: (error) => {
            callbacks.onError(new Error(error.message));
          },
        },
      });

      // Setup audio track handling
      this.setupAudioTracks();

      // Connect to bot
      const connectParams: any = {
        endpoint: BOT_START_URL,
        requestData: {
          createDailyRoom: false,
          enableDefaultIceServers: true,
          transport: 'webrtc',
          language: selectedLanguage, // Pass language preference
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

    this.client.on(RTVIEvent.TrackStarted, (track, participant) => {
      if (!participant?.local && track.kind === 'audio') {
        // Bot audio track - create audio element to play it
        const audio = document.createElement('audio');
        audio.autoplay = true;
        audio.srcObject = new MediaStream([track]);
        document.body.appendChild(audio);
      }
    });
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
