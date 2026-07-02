import { useRef, useCallback } from "react";

interface UsePttButtonHandlersOptions {
  handlePttDown: () => Promise<void> | void;
  handlePttUp: () => Promise<void> | void;
  isConnecting: boolean;
  isCapturing: boolean;
}

export function usePttButtonHandlers({
  handlePttDown,
  handlePttUp,
  isConnecting,
  isCapturing,
}: UsePttButtonHandlersOptions) {
  const btnRef = useRef<HTMLButtonElement>(null);

  const releaseCapture = useCallback((e: React.PointerEvent) => {
    const btn = btnRef.current;
    if (btn?.hasPointerCapture(e.pointerId)) {
      btn.releasePointerCapture(e.pointerId);
    }
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      if (isConnecting && !isCapturing) return;
      try {
        btnRef.current?.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported — ignore */
      }
      void handlePttDown();
    },
    [handlePttDown, isConnecting, isCapturing],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      releaseCapture(e);
      void handlePttUp();
    },
    [handlePttUp, releaseCapture],
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      releaseCapture(e);
      void handlePttUp();
    },
    [handlePttUp, releaseCapture],
  );

  const onLostPointerCapture = useCallback(() => {
    void handlePttUp();
  }, [handlePttUp]);

  return {
    btnRef,
    onPointerDown,
    onPointerUp,
    onPointerCancel,
    onLostPointerCapture,
  };
}
