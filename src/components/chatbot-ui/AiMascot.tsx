import { motion } from "framer-motion";
import { schoolOsMascotSvg } from "../schoolOsMascotSvg";

interface AiMascotProps {
  size?: number;
  animate?: boolean;
}

export default function AiMascot({ size = 200, animate = true }: AiMascotProps) {
  const glowSize = size * 1.35;

  return (
    <div className="ai-mascot" style={{ width: size, height: size }}>
      <motion.div
        className="ai-mascot-glow"
        style={{
          width: glowSize,
          height: glowSize,
          borderRadius: "50%",
          left: (size - glowSize) / 2,
          top: (size - glowSize) / 2,
        }}
        animate={
          animate
            ? { scale: [1, 1.12, 1], opacity: [0.4, 0.6, 0.4] }
            : undefined
        }
        transition={{ duration: 3.5, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="ai-mascot-ring"
        style={{
          width: size * 1.15,
          height: size * 1.15,
          borderRadius: "50%",
        }}
        animate={
          animate ? { scale: [1, 1.18, 1], opacity: [0.35, 0, 0.35] } : undefined
        }
        transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
      />
      <motion.div
        className="ai-mascot-body"
        style={{ width: size, height: size }}
        animate={animate ? { y: [0, -12, 0] } : undefined}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <div
          className="ai-mascot-svg"
          style={{ width: "100%", height: "100%" }}
          dangerouslySetInnerHTML={{ __html: schoolOsMascotSvg }}
        />
      </motion.div>
    </div>
  );
}
