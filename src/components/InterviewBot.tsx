import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { PipecatClient, RTVIEvent } from "@pipecat-ai/client-js";
import {
//   AVAILABLE_TRANSPORTS,
  DEFAULT_TRANSPORT,
  TRANSPORT_CONFIG,
  createTransport,
} from "../config/config";
import ChatHeader from "./ChatHeader";
import ChatConversation from "./ChatConversation";
import ChatFooter from "./ChatFooter";
import type { ChatMessage } from "./types";

interface ConversationMessage {
  role: "user" | "bot" | "placeholder";
  text: string;
}

interface EventEntry {
  timestamp: string;
  eventName: string;
  data: string;
}

type BotType = "default" | "interview";

const InterviewBot = ({
  onSelectedBotChange,
  onSwitchToDefault,
}: {
  userId: string;
  roles: string;
  email: string;
  onSelectedBotChange?: (bot: BotType) => void;
  onSwitchToDefault?: () => void;
}) => {
  // Refs
  const clientRef = useRef<PipecatClient | null>(null);
  const isConnectingRef = useRef(false);
  const botAudioElRef = useRef<HTMLAudioElement | null>(null);
  const conversationLogRef = useRef<HTMLDivElement | null>(null);
  const eventsLogRef = useRef<HTMLDivElement | null>(null);
  const botVideoContainerRef = useRef<HTMLDivElement | null>(null);
  const jdTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const botNatureSelectRef = useRef<HTMLSelectElement | null>(null);

  // State
  const [transportType] = useState<string>(DEFAULT_TRANSPORT);
  const [isConnected, setIsConnected] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(false);
  const [inputText, setInputText] = useState("");
  const [conversationMessages, setConversationMessages] = useState<
    ConversationMessage[]
  >([
    {
      role: "placeholder",
      text: "Welcome! I'm ready to help you with queries. You can ask me anything or use the dropdown to select a specific flow.",
    },
  ]);
  const [eventsList, setEventsList] = useState<EventEntry[]>([]);

  // Add event to the events log
  const addEvent = useCallback(
    (eventName: string, data: string | Record<string, unknown>) => {
      const timestamp = new Date().toLocaleTimeString();
      const dataStr =
        typeof data === "string" ? data : JSON.stringify(data, null, 2);
      setEventsList((prev) => [
        ...prev,
        { timestamp, eventName, data: dataStr },
      ]);
    },
    []
  );

  // Add conversation message
  const addConversationMessage = useCallback(
    (text: string, role: "user" | "bot" | "placeholder") => {
      setConversationMessages((prev) => {
        const updated = [...prev];
        if (prev.length === 1 && prev[0].role === "placeholder") {
          updated[0] = { role, text };
        } else {
          updated.push({ role, text });
        }
        return updated;
      });
    },
    []
  );

  // Scroll events log to bottom
  useEffect(() => {
    if (eventsLogRef.current) {
      eventsLogRef.current.scrollTop = eventsLogRef.current.scrollHeight;
    }
  }, [eventsList]);

  // Scroll conversation log to bottom
  useEffect(() => {
    if (conversationLogRef.current) {
      conversationLogRef.current.scrollTop =
        conversationLogRef.current.scrollHeight;
    }
  }, [conversationMessages]);

  // Validate config
  const validateConfig = useCallback((): boolean => {
    // if (!jdTextareaRef.current) return false;
    // const jd = jdTextareaRef.current.value.trim();
    // if (!jd) {
    //   alert("Please enter a Job Description (JD) before starting the interview.");
    //   jdTextareaRef.current.focus();
    //   return false;
    // }
    // if (jd.length < 50) {
    //   alert("Job Description should be at least 50 characters long.");
    //   jdTextareaRef.current.focus();
    //   return false;
    // }
    return true;
  }, []);

  // Get config
  const getConfig = useCallback(
    () => ({
      botNature: botNatureSelectRef.current?.value || "decent",
      jd: jdTextareaRef.current?.value.trim() || "",
    }),
    []
  );

  // Setup audio from PipecatClient tracks
  const setupAudio = useCallback((client: PipecatClient) => {
    client.on(RTVIEvent.TrackStarted, (track, participant) => {
      if (!participant?.local) {
        if (track.kind === "audio") {
          addEvent("track-started", "Bot audio track");
          // Remove any previous bot audio element to avoid conflicts.
          if (botAudioElRef.current) {
            try {
              botAudioElRef.current.pause();
              botAudioElRef.current.srcObject = null;
              botAudioElRef.current.remove();
            } catch {
              // ignore
            }
            botAudioElRef.current = null;
          }

          const audio = document.createElement("audio");
          audio.autoplay = true;
          audio.setAttribute("playsinline", "true");
          audio.muted = false;
          audio.volume = 1;
          audio.setAttribute("data-pipecat-bot-audio", "true");
          audio.srcObject = new MediaStream([track]);
          document.body.appendChild(audio);
          botAudioElRef.current = audio;

          // Explicit play() helps on some browsers even after unlock gesture.
          void audio.play().catch((err) => {
            addEvent(
              "audio-play-blocked",
              err instanceof Error ? err.message : String(err)
            );
          });
        } else if (track.kind === "video") {
          addEvent("track-started", "Bot video track");
          setupVideoTrack(track);
        }
      }
    });

    client.on(RTVIEvent.TrackStopped, (track, participant) => {
      if (participant?.local) return;
      if (track.kind === "video") {
        addEvent("track-stopped", "Bot video track");
        clearVideoTrack();
        return;
      }
      if (track.kind === "audio" && botAudioElRef.current) {
        addEvent("track-stopped", "Bot audio track");
        try {
          botAudioElRef.current.pause();
          botAudioElRef.current.srcObject = null;
          botAudioElRef.current.remove();
        } catch {
          // ignore
        }
        botAudioElRef.current = null;
      }
    });
  }, [addEvent]);

  // Setup video track
  const setupVideoTrack = useCallback((track: MediaStreamTrack) => {
    if (!botVideoContainerRef.current) return;

    const existingVideo = botVideoContainerRef.current.querySelector("video");
    if (existingVideo?.srcObject) {
      const oldTrack = (
        existingVideo.srcObject as MediaStream
      ).getVideoTracks()[0];
      if (oldTrack?.id === track.id) return;
    }

    botVideoContainerRef.current.innerHTML = "";

    const videoEl = document.createElement("video");
    videoEl.autoplay = true;
    videoEl.playsInline = true;
    videoEl.muted = true;

    videoEl.srcObject = new MediaStream([track]);
    botVideoContainerRef.current.appendChild(videoEl);
  }, []);

  // Clear video track
  const clearVideoTrack = useCallback(() => {
    if (!botVideoContainerRef.current) return;

    const video = botVideoContainerRef.current.querySelector("video");
    if (video?.srcObject) {
      (video.srcObject as MediaStream)
        .getTracks()
        .forEach((track) => track.stop());
      video.srcObject = null;
    }
    botVideoContainerRef.current.innerHTML = `
      <div class="video-placeholder">
        <span>Video will appear here when connected</span>
      </div>
    `;
  }, []);

  // Connect to bot
  const connect = useCallback(async () => {
    try {
      if (isConnected) return;
      if (isConnectingRef.current) return;
      isConnectingRef.current = true;

      if (!validateConfig()) return;

      const config = getConfig();

      addEvent("connecting", `Using ${transportType} transport`);
      addEvent("config", `Bot Nature: ${config.botNature}, JD Length: ${config.jd.length} chars`);

      // const configServerUrl =
      //   import.meta.env.VITE_CONFIG_SERVER_URL || "http://localhost:7861";

      // try {
      //   addEvent("saving-config", "Saving interview configuration...");
      //   const response = await fetch(`${configServerUrl}/api/interview-config`, {
      //     method: "POST",
      //     headers: {
      //       "Content-Type": "application/json",
      //     },
      //     body: JSON.stringify({
      //       botNature: config.botNature,
      //       jd: config.jd,
      //     }),
      //   });

      //   if (!response.ok) {
      //     const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
      //     throw new Error(
      //       errorData.error || `Failed to save config: ${response.statusText}`
      //     );
      //   }

      //   const result = await response.json();
      //   addEvent("config-saved", `Configuration saved: ${result.message}`);
      // } catch (error) {
      //   const errorMsg = error instanceof Error ? error.message : "Unknown error";
      //   addEvent("config-error", `Failed to save config: ${errorMsg}`);
      //   console.warn("Config save failed, continuing with defaults:", error);
      // }

      // Create transport
      const transport = (await createTransport(
        transportType as "daily" | "smallwebrtc"
      )) as unknown;

      // Create client
      const client = new PipecatClient({
        transport: transport as any,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => {
            setIsConnected(true);
            setIsMicEnabled(client.isMicEnabled);
            addEvent("connected", "Successfully connected to bot");
            setConversationMessages([]);
          },
          onDisconnected: () => {
            setIsConnected(false);
            setIsMicEnabled(false);
            clearVideoTrack();
            addEvent("disconnected", "Disconnected from bot");
          },
          onTransportStateChanged: (state) => {
            addEvent("transport-state", state);
          },
          onBotReady: () => {
            addEvent("bot-ready", "Bot is ready to talk");
          },
          onUserTranscript: (data) => {
            if (data.final) {
              addConversationMessage(data.text, "user");
            }
          },
          // Bot transcription is deprecated; use onBotOutput.
          // Only append sentence-level output to avoid word-by-word spam.
          onBotOutput: (data: any) => {
            try {
              const text = (data?.text ?? "").toString();
              const aggregatedBy = data?.aggregated_by;
              if (!text) return;
              if (aggregatedBy && aggregatedBy !== "sentence") return;
              addConversationMessage(text, "bot");
            } catch {
              // ignore
            }
          },
          onError: (error: any) => {
            const errorMsg = error instanceof Error ? error.message : error?.message || "Unknown error";
            addEvent("error", errorMsg);
          },
        },
      });

      clientRef.current = client;

      // Setup audio
      setupAudio(client);

      // Start bot + connect (preferred in newer SDKs)
      const connectParams = TRANSPORT_CONFIG[transportType as string];
      const anyClient = client as any;
      if (typeof anyClient.startBotAndConnect === "function") {
        await anyClient.startBotAndConnect(connectParams);
      } else {
        // Backward compatibility
        await anyClient.connect(connectParams);
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      addEvent("error", errorMsg);
      console.error("Connection error:", error);
    } finally {
      isConnectingRef.current = false;
    }
  }, [
    validateConfig,
    getConfig,
    transportType,
    addEvent,
    setupAudio,
    addConversationMessage,
    isConnected,
  ]);

  // Disconnect from bot
  const disconnect = useCallback(async () => {
    try {
      if (clientRef.current) {
        await clientRef.current.disconnect();
        clientRef.current = null;
      }
      setIsConnected(false);
      setIsMicEnabled(false);
      clearVideoTrack();
      addEvent("disconnected", "Manually disconnected from bot");
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      addEvent("disconnect-error", errorMsg);
      console.error("Disconnect error:", error);
    }
  }, [addEvent]);

  // Toggle microphone
  const toggleMic = useCallback(() => {
    if (clientRef.current) {
      const newState = !clientRef.current.isMicEnabled;
      clientRef.current.enableMic(newState);
      setIsMicEnabled(newState);
    }
  }, []);

  const chatHistory: ChatMessage[] = useMemo(() => {
    return conversationMessages
      .map((m) => {
        if (m.role === "user") return { type: "user", text: m.text };
        return { type: "bot", answer: m.text, activeTab: "answer" as const };
      });
  }, [conversationMessages]);

  // Auto-connect when entering voice mode so user doesn't need extra buttons.
  useEffect(() => {
    if (!isConnected) {
      void connect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="chatbot-root">
        <div className="chatbot-container">
      {/* Header */}
      <ChatHeader
        selectedBot={"interview"}
        onSelectedBotChange={(bot) => {
          if (bot === "default" && onSwitchToDefault) {
            onSwitchToDefault();
          }
        }}
        routerMode={"manual"}
        activeFlow={"query"}
        onSetRoutingMode={() => {}}
        onSelectFlow={() => {}}
        devices={[]}
        selectedDeviceId={"default"}
        onSelectDeviceId={() => {}}
        languages={[{ label: "Auto Detect", value: "auto" }]}
        selectedLanguage={"auto"}
        onSelectLanguage={() => {}}
      />

      {/* Conversation */}
      <ChatConversation
        chatHistory={chatHistory}
        isProcessing={false}
        activeFlow={"query"}
        attendanceStep={"class_info"}
        loadingClassSections={false}
        selectedClassSection={null}
        onSelectClassSection={() => {}}
        loadingLeaveRequests={false}
        leaveApprovalRequests={[]}
        rejectReason={{}}
        onRejectReasonChange={() => {}}
        onApproveLeaveRequest={() => {}}
        onRejectLeaveRequest={() => {}}
        editingMessageIndex={null}
        attendanceData={[]}
        classInfo={null}
        onAttendanceDataChange={() => {}}
        onAddStudent={() => {}}
        onRemoveStudent={() => {}}
        onSaveAttendance={() => {}}
        onCancelAttendanceEdit={() => {}}
        ttsLoading={null}
        onPlayTTS={() => {}}
        getThumbsUpClass={() => "bot-action-btn"}
        getThumbsDownClass={() => "bot-action-btn"}
        onSendFeedback={() => {}}
        feedbackComment={{}}
        onFeedbackCommentChange={() => {}}
        showCorrectionBox={null}
        onToggleCorrectionBox={() => {}}
      />

      {/* Footer */}
      <ChatFooter
        activeFlow={"query"}
        inputText={inputText}
        onInputTextChange={(value) => setInputText(value)}
        onSubmit={() => void (isConnected ? disconnect() : connect())}
        isRecording={isMicEnabled}
        onToggleMic={() => {
          if (!isConnected) return;
          toggleMic();
        }}
        onFileSelected={() => {}}
        onStartVoiceMode={() => {
          // Already in voice mode; no-op.
        }}
        onStopVoiceMode={() => {
          onSelectedBotChange?.("default");
          void disconnect();
        }}
        isVoiceMode={true}
      />
      </div>
    </div>
  );
};

export default InterviewBot;
