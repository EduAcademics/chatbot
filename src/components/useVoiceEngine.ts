/**
 * useVoiceEngine.ts
 *
 * RESPONSIBILITY: Voice streaming and continuous listening
 * - WebSocket connection management
 * - AudioContext and microphone handling
 * - Audio processing and conversion
 * - Flow control signal handling from backend
 * - Continuous listening mode management
 * - No flow logic, no routing logic
 */

import { useRef, useCallback, useState } from "react";

const WS_BASE = import.meta.env.VITE_WS_BASE_URL;

// Flow control signal from backend
export interface FlowSignal {
  keep_listening: boolean;
  flow_status:
    | "in_progress"
    | "ready_to_submit"
    | "complete"
    | "cancelled"
    | "error";
  fields_remaining: number;
  play_audio: boolean;
}

export interface UseVoiceEngineOptions {
  selectedDeviceId: string;
  selectedLanguage: string;
  activeFlow: string;
  isProcessing: boolean;
  onTextUpdate: (text: string) => void;
  onAutoSubmit?: () => void;
  onFlowSignal?: (signal: FlowSignal) => void;
}

export interface UseVoiceEngineReturn {
  startStreaming: () => Promise<void>;
  stopStreaming: () => void;
  isRecording: boolean;
  continuousMode: boolean;
  handleFlowSignal: (signal: FlowSignal) => void;
}

const convertFloat32ToInt16 = (buffer: Float32Array): Int16Array => {
  const int16Buffer = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Buffer;
};

export const useVoiceEngine = (
  options: UseVoiceEngineOptions
): UseVoiceEngineReturn => {
  const {
    selectedDeviceId,
    selectedLanguage,
    activeFlow,
    isProcessing,
    onTextUpdate,
    onAutoSubmit,
    onFlowSignal,
  } = options;

  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [continuousMode, setContinuousMode] = useState<boolean>(false);
  const fullVoiceAutoSubmitTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);

  const startStreaming = useCallback(async () => {
    try {
      // Request microphone
      const stream = await navigator.mediaDevices.getUserMedia({
        audio:
          selectedDeviceId === "default"
            ? true
            : { deviceId: { exact: selectedDeviceId } },
      });
      micStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceRef.current = source;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorRef.current = processor;

      const socket = new WebSocket(`${WS_BASE}/ws/speech_to_text`);
      socketRef.current = socket;

      socket.onopen = () => {
        socket.send(selectedLanguage);

        processor.onaudioprocess = (e) => {
          const floatSamples = e.inputBuffer.getChannelData(0);
          const int16Samples = convertFloat32ToInt16(floatSamples);
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(int16Samples.buffer);
          }
        };

        source.connect(processor);
        processor.connect(audioContext.destination);
        setIsRecording(true);
      };

      socket.onmessage = (event: MessageEvent) => {
        const newText = event.data;
        onTextUpdate(newText);

        // For full voice attendance flow, implement 3-second auto-submit
        if (activeFlow === "full_voice_attendance" && onAutoSubmit) {
          // Clear existing timer
          if (fullVoiceAutoSubmitTimerRef.current) {
            clearTimeout(fullVoiceAutoSubmitTimerRef.current);
          }

          // Set new 3-second timer for auto-submit
          fullVoiceAutoSubmitTimerRef.current = setTimeout(() => {
            if (!isProcessing && onAutoSubmit) {
              onAutoSubmit();
            }
          }, 3000);
        }

        // In continuous mode, don't auto-close the socket
        // Let the backend signal via flow_signal whether to keep listening
      };

      socket.onerror = (err) => {
        console.error("WebSocket error:", err);
      };

      socket.onclose = () => {
        setContinuousMode(false);
        setIsRecording(false);
        console.log("WebSocket closed");
      };
    } catch (error) {
      console.error("Error starting voice streaming:", error);
      setIsRecording(false);
    }
  }, [
    selectedDeviceId,
    selectedLanguage,
    activeFlow,
    isProcessing,
    onTextUpdate,
    onAutoSubmit,
  ]);

  // Handle flow signal from backend (Component 1, Change 5)
  const handleFlowSignal = useCallback(
    (signal: FlowSignal) => {
      console.log("[Voice Engine] Received flow signal:", signal);

      if (signal.keep_listening) {
        // Backend wants us to keep listening for more input
        setContinuousMode(true);
        console.log("[Voice Engine] Entering continuous listening mode");
      } else {
        // Backend signals to stop listening (exit, complete, error, etc.)
        setContinuousMode(false);
        console.log(
          `[Voice Engine] Exiting listening mode - flow_status: ${signal.flow_status}`
        );

        // Close the socket and mic for final responses
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.close();
        }

        // Stop recording for completion/error states
        if (
          signal.flow_status === "complete" ||
          signal.flow_status === "error"
        ) {
          // Will be handled by stopStreaming()
        }
      }

      // Pass signal to parent component (AudioStreamerChatBot)
      if (onFlowSignal) {
        onFlowSignal(signal);
      }
    },
    [onFlowSignal]
  );

  const stopStreaming = useCallback(() => {
    processorRef.current?.disconnect();
    processorRef.current = null;

    sourceRef.current?.disconnect();
    sourceRef.current = null;

    audioContextRef.current?.close();
    audioContextRef.current = null;

    // Stop and release microphone stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((track) => track.stop());
      micStreamRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    if (fullVoiceAutoSubmitTimerRef.current) {
      clearTimeout(fullVoiceAutoSubmitTimerRef.current);
      fullVoiceAutoSubmitTimerRef.current = null;
    }

    // Reset continuous mode when stopping
    setContinuousMode(false);
    setIsRecording(false);

    // Call onAutoSubmit when stopping (for normal voice input)
    if (onAutoSubmit) {
      onAutoSubmit();
    }
  }, [onAutoSubmit]);

  return {
    startStreaming,
    stopStreaming,
    isRecording,
    continuousMode,
    handleFlowSignal,
  };
};
