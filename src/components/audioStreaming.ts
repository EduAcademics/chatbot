import React from "react";
import { WS_BASE } from "./types";

export const convertFloat32ToInt16 = (buffer: Float32Array): Int16Array => {
  const int16Buffer = new Int16Array(buffer.length);
  for (let i = 0; i < buffer.length; i++) {
    const s = Math.max(-1, Math.min(1, buffer[i]));
    int16Buffer[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return int16Buffer;
};

export interface AudioStreamingRefs {
  socketRef: React.MutableRefObject<WebSocket | null>;
  audioContextRef: React.MutableRefObject<AudioContext | null>;
  processorRef: React.MutableRefObject<ScriptProcessorNode | null>;
  sourceRef: React.MutableRefObject<MediaStreamAudioSourceNode | null>;
  micStreamRef: React.MutableRefObject<MediaStream | null>;
}

export interface AudioStreamingCallbacks {
  setIsRecording: (recording: boolean) => void;
  setInputText: (text: string | ((prev: string) => string)) => void;
  handleSubmit: () => void;
}

export const startStreaming = async (
  refs: AudioStreamingRefs,
  callbacks: AudioStreamingCallbacks,
  selectedDeviceId: string,
  selectedLanguage: string
) => {
  const { socketRef, audioContextRef, processorRef, sourceRef, micStreamRef } = refs;
  const { setIsRecording, setInputText, handleSubmit } = callbacks;

  // Request microphone only when starting recording
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
    setInputText((prev) => prev + " " + event.data);
  };

  socket.onerror = (err) => console.error("WebSocket error:", err);
  socket.onclose = () => {
    setIsRecording(false);
    console.log("WebSocket closed");
  };
};

export const stopStreaming = (
  refs: AudioStreamingRefs,
  callbacks: AudioStreamingCallbacks
) => {
  const { processorRef, sourceRef, audioContextRef, micStreamRef, socketRef } = refs;
  const { handleSubmit } = callbacks;

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

  handleSubmit();
};

