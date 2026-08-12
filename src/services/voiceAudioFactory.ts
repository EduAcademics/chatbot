import { VOICE_TRANSPORT } from '../config/settings';
import {
  LiveKitAudioService,
  type VoiceAudioCallbacks,
  type VoiceConnectOptions,
} from './livekitAudio';
import { WebRTCAudioService } from './webrtcAudio';

export type { VoiceAudioCallbacks, VoiceConnectOptions };

/** Shared surface implemented by WebRTC and LiveKit voice transports. */
export interface VoiceAudioService {
  connect(
    selectedLanguage: string,
    callbacks: VoiceAudioCallbacks,
    options?: VoiceConnectOptions,
  ): Promise<void>;
  resumeBotAudio(): void;
  speakText(text: string, interrupt?: boolean): void;
  interruptPipelineTTS(): void;
  interruptBotAudio(): void;
  disconnect(): Promise<void>;
  enableMic(enabled: boolean): void;
  getIsConnected(): boolean;
}

/**
 * Factory: pick LiveKit or legacy Small-WebRTC based on VITE_VOICE_TRANSPORT.
 * Default is livekit when the env flag is set; otherwise keep WebRTC.
 */
export function createVoiceAudioService(): VoiceAudioService {
  if (VOICE_TRANSPORT === 'livekit') {
    return new LiveKitAudioService();
  }
  return new WebRTCAudioService();
}
