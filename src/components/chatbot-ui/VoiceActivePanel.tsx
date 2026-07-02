import VoiceWaves from "./VoiceWaves";
import WaveformBars from "./WaveformBars";

interface VoiceActivePanelProps {
  transcript: string;
  isListening: boolean;
}

export default function VoiceActivePanel({
  transcript,
  isListening,
}: VoiceActivePanelProps) {
  return (
    <div className="voice-active-panel">
      {isListening && <VoiceWaves />}
      <WaveformBars active={isListening} bars={7} />
      <p className="voice-active-label">
        {isListening ? "Listening…" : "Processing…"}
      </p>
      <div className="voice-transcript-wrap">
        <p className="voice-transcript-text">
          {transcript || (isListening ? "Listening…" : "Getting ready…")}
          {isListening && <span className="voice-transcript-cursor" />}
        </p>
      </div>
    </div>
  );
}
