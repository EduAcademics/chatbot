import React from "react";
import { FiMoreVertical } from "react-icons/fi";
import { useState, useRef, useEffect } from "react";

interface ChatHeaderProps {
  botMode?: string;
  onBotModeChange?: (mode: string) => void;
  botModes?: { label: string; value: string }[];
  showMenu?: boolean;
  menuItems?: Array<{
    label: string;
    value: string;
    tooltip?: string;
  }>;
  onMenuItemClick?: (value: string) => void;
  children?: React.ReactNode;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  botMode,
  onBotModeChange,
  botModes = [],
  showMenu = false,
  menuItems = [],
  onMenuItemClick,
  children,
}) => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsMenuOpen(false);
        setHoveredMenuItem(null);
        if (hoverTimeoutRef.current) {
          clearTimeout(hoverTimeoutRef.current);
          hoverTimeoutRef.current = null;
        }
      }
    };

    if (isMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
    };
  }, [isMenuOpen]);

  return (
    <div className="chatbot-header-section">
      <h1 className="chatbot-header-title">
        <img
          src="/sofisto-img.png"
          alt="Sofisto Robot"
          className="robot-icon"
        />
        Chat with Sofisto
      </h1>

      <div className="header-controls">
        {children}

        {botModes.length > 0 && botMode && onBotModeChange && (
          <div className="chatbot-dropdown-group-topbar">
            <select
              value={botMode}
              onChange={(e) => onBotModeChange(e.target.value)}
              className="chatbot-select-topbar"
            >
              {botModes.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {showMenu && menuItems.length > 0 && (
          <div className="three-dot-menu-container" ref={menuRef}>
            <button
              className="three-dot-menu-btn"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              title="Menu"
            >
              <FiMoreVertical size={20} />
            </button>

            {isMenuOpen && (
              <div className="three-dot-menu">
                {menuItems.map((item) => (
                  <div
                    key={item.value}
                    className="menu-item-option"
                    onMouseEnter={() => {
                      if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                      }
                      setHoveredMenuItem(item.value);
                    }}
                    onMouseLeave={() => {
                      if (hoverTimeoutRef.current) {
                        clearTimeout(hoverTimeoutRef.current);
                      }
                      hoverTimeoutRef.current = setTimeout(() => {
                        setHoveredMenuItem(null);
                      }, 100);
                    }}
                    onClick={() => {
                      onMenuItemClick?.(item.value);
                      setIsMenuOpen(false);
                    }}
                  >
                    <span className="menu-option-label">{item.label}</span>
                    {item.tooltip && hoveredMenuItem === item.value && (
                      <div className="menu-tooltip-right">{item.tooltip}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatHeader;
