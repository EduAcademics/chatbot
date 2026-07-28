import { useState } from "react";
import {
  FiTrendingUp,
  FiScissors,
  FiXCircle,
  FiCheckCircle,
  FiThumbsUp,
  FiThumbsDown,
  FiZap,
  FiGitMerge,
} from "react-icons/fi";
import type { IconType } from "react-icons";
import type { ActionOption } from "./types";



const ICONS: Record<string, IconType> = {
  TrendingUp: FiTrendingUp,
  Scissors: FiScissors,
  XCircle: FiXCircle,
  CheckCircle: FiCheckCircle,
  ThumbsUp: FiThumbsUp,
  ThumbsDown: FiThumbsDown,
  Zap: FiZap,
  GitMerge: FiGitMerge,
};


const CONFIRM_MESSAGE: Record<string, string> = {
  revise:
    "Update this fee head's rate in the Fee Structure module to apply the change.",
  reduce:
    "Share with Finance to trim the operational cost linked to this fee head.",
  retire:
    "Deactivate this fee head in the Fee Structure module after final review.",
};

const toneClass: Record<string, string> = {
  neutral: "action-engine-btn-neutral",
  success: "action-engine-btn-success",
  warning: "action-engine-btn-warning",
  danger: "action-engine-btn-danger",
};

interface ActionEngineProps {
  options: ActionOption[];
  title?: string;
  onSelect?: (option: ActionOption) => void;
}

export default function ActionEngine({
  options,
  title = "Recommended Action",
  onSelect,
}: ActionEngineProps) {
  const [selected, setSelected] = useState<ActionOption | null>(null);

  if (!options?.length) return null;

  const handleClick = (option: ActionOption) => {
    setSelected(option);
    onSelect?.(option);
  };

  return (
    <div className="action-engine mt-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
      <div className="action-engine-title mb-2 text-sm font-semibold text-slate-800">
        {title}
      </div>
      <div className="action-engine-buttons flex flex-wrap gap-2">
        {options.map((option) => {
          const Icon = option.icon ? ICONS[option.icon] : undefined;
          const isActive = selected?.id === option.id;
          return (
            <button
              key={option.id}
              type="button"
              className={`action-engine-btn ${toneClass[option.tone || "neutral"] || toneClass.neutral} ${
                isActive ? "action-engine-btn-active" : ""
              }`}
              onClick={() => handleClick(option)}
            >
              {Icon ? <Icon className="action-engine-icon" /> : null}
              <span>{option.label}</span>
            </button>
          );
        })}
      </div>
      {selected ? (
        <div className="action-engine-confirm mt-2 flex items-center gap-2 text-sm text-emerald-700">
          <FiCheckCircle />
          <span>
            <strong>{selected.label}</strong> selected —{" "}
            {CONFIRM_MESSAGE[selected.id] ||
              "noted for your 30-day action plan."}
          </span>
        </div>
      ) : null}
    </div>
  );
}
