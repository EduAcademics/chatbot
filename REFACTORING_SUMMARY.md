# Refactoring Summary

## Files Created

1. **useVoiceEngine.ts** - Voice streaming logic (WebSocket + AudioContext + mic)
2. **chatRouter.ts** - Flow detection & routing logic
3. **chatFlows.ts** - All chatbot flows (attendance, leave, assignment, etc.)
4. **useChatController.ts** - Orchestration hook replacing handleSubmit

## Key Changes Needed in AudioStreamerChatBot.tsx

### 1. Import the new hooks
```typescript
import { useVoiceEngine } from './useVoiceEngine';
import { useChatController } from './useChatController';
import { FlowType } from './chatRouter';
```

### 2. Remove old voice streaming code (lines ~229-338)
- Remove `convertFloat32ToInt16`
- Remove `startStreaming` function
- Remove `stopStreaming` function
- Remove voice-related refs (socketRef, audioContextRef, etc.)

### 3. Replace with useVoiceEngine hook
```typescript
const voiceEngine = useVoiceEngine({
  selectedDeviceId,
  selectedLanguage,
  activeFlow,
  isProcessing,
  onTextUpdate: (text) => setInputText(prev => prev + " " + text),
  onAutoSubmit: () => {
    if (inputText.trim()) {
      handleSubmit(inputText.trim());
    }
  },
});
```

### 4. Remove old handleSubmit (lines ~494-1682)
- This entire function should be removed

### 5. Replace with useChatController hook
```typescript
const { handleSubmit: handleSubmitMessage } = useChatController({
  // ... all the options
});
```

### 6. Update voice button handlers
```typescript
onClick={voiceEngine.isRecording ? voiceEngine.stopStreaming : voiceEngine.startStreaming}
```

### 7. Update submit handler
```typescript
onClick={() => handleSubmitMessage(inputText.trim())}
onKeyDown={(e) => e.key === "Enter" && !voiceEngine.isRecording && handleSubmitMessage(inputText.trim())}
```

## What Stays in AudioStreamerChatBot.tsx

- All UI rendering (JSX)
- UI state management (useState for UI)
- Event handlers for UI interactions
- File upload handlers (UI-specific)
- Attendance approval/rejection handlers (UI-specific)
- Feedback handlers (UI-specific)
- TTS handlers (UI-specific)
- All styling and CSS

## What Was Moved

- Voice streaming logic → useVoiceEngine.ts
- Flow routing logic → chatRouter.ts
- Flow execution logic → chatFlows.ts
- Message submission orchestration → useChatController.ts

