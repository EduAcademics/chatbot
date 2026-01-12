// src/utils/ttsHelper.ts

/**
 * TTSHelper: Singleton class for Text-to-Speech using Web Speech API
 */
export class TTSHelper {
  private static instance: TTSHelper;
  private synth: SpeechSynthesis | null;
  private utterance: SpeechSynthesisUtterance | null = null;
  private currentVoice: SpeechSynthesisVoice | null = null;
  private rate: number = 1.0;
  private pitch: number = 1.0;

  private constructor() {
    this.synth =
      typeof window !== "undefined" && window.speechSynthesis
        ? window.speechSynthesis
        : null;
    this.setVoice();
  }

  public static getInstance(): TTSHelper {
    if (!TTSHelper.instance) {
      TTSHelper.instance = new TTSHelper();
    }
    return TTSHelper.instance;
  }

  public async speak(text: string, onEnd?: () => void): Promise<void> {
    if (!this.synth) {
      console.warn("Speech Synthesis API not supported in this browser.");
      if (onEnd) onEnd();
      return;
    }
    this.stop();
    return new Promise((resolve) => {
      this.utterance = new window.SpeechSynthesisUtterance(text);
      this.utterance.rate = this.rate;
      this.utterance.pitch = this.pitch;
      if (this.currentVoice) {
        this.utterance.voice = this.currentVoice;
      }
      this.utterance.onend = () => {
        this.utterance = null;
        if (onEnd) onEnd();
        resolve();
      };
      this.utterance.onerror = (e) => {
        console.error("TTS error:", e);
        this.utterance = null;
        if (onEnd) onEnd();
        resolve();
      };
      this.synth!.speak(this.utterance);
    });
  }

  public stop(): void {
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
    }
    this.utterance = null;
  }

  public isSpeaking(): boolean {
    return !!(this.synth && this.synth.speaking);
  }

  public setVoice(voiceName?: string): void {
    if (!this.synth) return;
    const voices = this.synth.getVoices();
    let selected: SpeechSynthesisVoice | undefined;
    if (voiceName) {
      selected = voices.find((v) => v.name === voiceName);
    }
    if (!selected) {
      // Prefer female voice if available
      selected = voices.find((v) =>
        /female|woman|girl/i.test(v.name + v.voiceURI)
      );
    }
    if (!selected && voices.length > 0) {
      selected = voices[0];
    }
    this.currentVoice = selected || null;
  }

  public setRate(rate: number): void {
    this.rate = Math.max(0.1, Math.min(rate, 2.0));
  }

  public setPitch(pitch: number): void {
    this.pitch = Math.max(0, Math.min(pitch, 2));
  }
}
