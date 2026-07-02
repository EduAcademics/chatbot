interface VoiceWavesProps {
  rings?: number;
}

export default function VoiceWaves({ rings = 4 }: VoiceWavesProps) {
  const baseSize = 160;
  return (
    <div className="voice-waves" aria-hidden="true">
      {Array.from({ length: rings }).map((_, i) => (
        <span
          key={i}
          className="voice-wave-ring"
          style={{
            width: baseSize + i * 60,
            height: baseSize + i * 60,
            animationDelay: `${i * 0.5}s`,
          }}
        />
      ))}
    </div>
  );
}
