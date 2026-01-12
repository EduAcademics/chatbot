// src/utils/voiceModeManager.ts

/**
 * VoiceModeManager: Singleton class to manage voice mode state for chatbot voice flows.
 */
export type VoiceFlowStep =
  | "initial"
  | "waiting_dates"
  | "waiting_leave_type"
  | "waiting_incharge"
  | "waiting_approval";

export class VoiceModeManager {
  private static instance: VoiceModeManager;
  private voiceActive: boolean = false;
  private step: VoiceFlowStep = "initial";
  private autoMic: boolean = false;

  private constructor() {}

  public static getInstance(): VoiceModeManager {
    if (!VoiceModeManager.instance) {
      VoiceModeManager.instance = new VoiceModeManager();
    }
    return VoiceModeManager.instance;
  }

  public activateVoiceMode(): void {
    this.voiceActive = true;
    this.step = "initial";
    this.autoMic = false;
  }

  public deactivateVoiceMode(): void {
    this.voiceActive = false;
    this.step = "initial";
    this.autoMic = false;
  }

  public setStep(step: VoiceFlowStep): void {
    this.step = step;
  }

  public getStep(): VoiceFlowStep {
    return this.step;
  }

  public shouldAutoMic(): boolean {
    return this.autoMic;
  }

  public setShouldAutoMic(value: boolean): void {
    this.autoMic = value;
  }

  public isVoiceActive(): boolean {
    return this.voiceActive;
  }

  public reset(): void {
    this.voiceActive = false;
    this.step = "initial";
    this.autoMic = false;
  }
}
