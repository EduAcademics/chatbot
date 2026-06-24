import { useEffect, useRef } from "react";

interface VoiceWaveformProps {
  isRecording: boolean;
  isVoiceActive: boolean;
  isConnecting?: boolean;
  barCount?: number;
}

/**
 * ChatGPT-style live waveform bars during PTT recording.
 */
export default function VoiceWaveform({
  isRecording,
  isVoiceActive,
  isConnecting = false,
  barCount = 36,
}: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef(0);
  const levelsRef = useRef<number[]>(Array(barCount).fill(0.15));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const dpr = window.devicePixelRatio || 1;

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      const w = Math.max(rect.width, 1);
      const h = Math.max(rect.height, 1);
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }

      ctx.clearRect(0, 0, w, h);
      phaseRef.current += isConnecting ? 0.04 : isVoiceActive ? 0.22 : 0.08;

      const gap = 3;
      const barW = Math.max(2, (w - gap * (barCount - 1)) / barCount);
      const centerY = h / 2;
      const levels = levelsRef.current;

      for (let i = 0; i < barCount; i++) {
        const target = isConnecting
          ? 0.12 + Math.sin(phaseRef.current + i * 0.35) * 0.08
          : isVoiceActive
            ? 0.25 +
              Math.abs(Math.sin(phaseRef.current * 1.4 + i * 0.55)) * 0.65 +
              Math.random() * 0.12
            : 0.1 + Math.abs(Math.sin(phaseRef.current + i * 0.4)) * 0.12;

        levels[i] += (target - levels[i]) * (isVoiceActive ? 0.35 : 0.12);
        const barH = Math.max(4, levels[i] * h * 0.92);
        const x = i * (barW + gap);
        const y = centerY - barH / 2;

        ctx.fillStyle = isConnecting
          ? "rgba(139, 115, 85, 0.35)"
          : isVoiceActive
            ? "rgba(90, 75, 55, 0.85)"
            : "rgba(139, 115, 85, 0.55)";
        ctx.beginPath();
        ctx.roundRect(x, y, barW, barH, barW / 2);
        ctx.fill();
      }

      if (isRecording || isConnecting) {
        raf = requestAnimationFrame(draw);
      }
    };

    if (isRecording || isConnecting) {
      raf = requestAnimationFrame(draw);
    } else {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    return () => cancelAnimationFrame(raf);
  }, [isRecording, isVoiceActive, isConnecting, barCount]);

  return (
    <canvas
      ref={canvasRef}
      className="ptt-waveform-canvas"
      aria-hidden="true"
    />
  );
}
