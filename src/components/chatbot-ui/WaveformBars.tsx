interface WaveformBarsProps {
  active?: boolean;
  bars?: number;
}

export default function WaveformBars({ active = false, bars = 5 }: WaveformBarsProps) {
  return (
    <div className={`waveform-bars ${active ? "waveform-bars--active" : ""}`}>
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          className="waveform-bar"
          style={{ animationDelay: `${i * 0.12}s` }}
        />
      ))}
    </div>
  );
}
