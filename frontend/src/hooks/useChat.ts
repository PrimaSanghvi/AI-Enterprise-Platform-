import { useCallback, useEffect, useReducer, useRef } from "react";
import { streamChat } from "../api/chat";
import type {
  ChatMessage,
  ChatResponseData,
  ChatStreamState,
  ChatThread,
  IntentClassifiedEvent,
} from "../types/chat";
import type {
  StreamEvent,
  ToolCallEvent,
  ToolResultEvent,
} from "../types/triage";

interface ChatState {
  messages: ChatMessage[];
  stream: ChatStreamState;
}

type Action =
  | { type: "ADD_USER_MESSAGE"; content: string }
  | { type: "STREAM_START" }
  | { type: "INTENT_CLASSIFIED"; data: IntentClassifiedEvent }
  | { type: "TOOL_CALL"; data: ToolCallEvent }
  | { type: "TOOL_RESULT"; data: ToolResultEvent }
  | { type: "RESPONSE"; data: ChatResponseData }
  | { type: "ERROR"; detail: string }
  | { type: "LOAD_THREAD"; messages: ChatMessage[] }
  | { type: "RESET" };

const initialStream: ChatStreamState = {
  status: "idle",
  events: [],
  response: null,
  error: null,
  intent: null,
};

const initialState: ChatState = {
  messages: [],
  stream: initialStream,
};

function reducer(state: ChatState, action: Action): ChatState {
  switch (action.type) {
    case "ADD_USER_MESSAGE":
      return {
        ...state,
        messages: [
          ...state.messages,
          { role: "user", content: action.content },
        ],
      };
    case "STREAM_START":
      return {
        ...state,
        stream: { status: "streaming", events: [], response: null, error: null, intent: null },
      };
    case "INTENT_CLASSIFIED":
      return {
        ...state,
        stream: { ...state.stream, intent: action.data },
      };
    case "TOOL_CALL":
      return {
        ...state,
        stream: {
          ...state.stream,
          events: [
            ...state.stream.events,
            { type: "tool_call", data: action.data } as StreamEvent,
          ],
        },
      };
    case "TOOL_RESULT":
      return {
        ...state,
        stream: {
          ...state.stream,
          events: [
            ...state.stream.events,
            { type: "tool_result", data: action.data } as StreamEvent,
          ],
        },
      };
    case "RESPONSE":
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            role: "assistant",
            content: action.data.answer,
            sources: action.data.sources,
            toolsUsed: action.data.tools_used,
            suggestions: action.data.suggested_followups,
          },
        ],
        stream: { ...state.stream, status: "done", response: action.data },
      };
    case "ERROR":
      return {
        ...state,
        stream: { ...state.stream, status: "error", error: action.detail },
      };
    case "LOAD_THREAD":
      return { messages: action.messages, stream: initialStream };
    case "RESET":
      return initialState;
    default:
      return state;
  }
}

interface UseChatOptions {
  activeThread: ChatThread | null;
  onUpdateThread?: (id: string, messages: ChatMessage[]) => void;
}

export function useChat({ activeThread, onUpdateThread }: UseChatOptions) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);
  const prevThreadIdRef = useRef<string | null>(null);

  // Load messages when active thread changes
  useEffect(() => {
    const newId = activeThread?.id ?? null;
    if (newId !== prevThreadIdRef.current) {
      prevThreadIdRef.current = newId;
      abortRef.current?.abort();
      if (activeThread) {
        dispatch({ type: "LOAD_THREAD", messages: activeThread.messages });
      } else {
        dispatch({ type: "RESET" });
      }
    }
  }, [activeThread]);

  const sendMessage = useCallback(
    async (text: string) => {
      if (!activeThread) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      dispatch({ type: "ADD_USER_MESSAGE", content: text });
      dispatch({ type: "STREAM_START" });

      // Pre-compute messages for the API call (current + new user message)
      const messagesForApi = [
        ...state.messages,
        { role: "user" as const, content: text },
      ];

      try {
        await streamChat(
          text,
          state.messages,
          (evt) => {
            switch (evt.event) {
              case "intent_classified":
                dispatch({
                  type: "INTENT_CLASSIFIED",
                  data: evt.data as unknown as IntentClassifiedEvent,
                });
                break;
              case "tool_call":
                dispatch({
                  type: "TOOL_CALL",
                  data: evt.data as unknown as ToolCallEvent,
                });
                break;
              case "tool_result":
                dispatch({
                  type: "TOOL_RESULT",
                  data: evt.data as unknown as ToolResultEvent,
                });
                break;
              case "response": {
                const respData = evt.data as unknown as ChatResponseData;
                dispatch({ type: "RESPONSE", data: respData });
                // Persist to thread
                const updatedMessages: ChatMessage[] = [
                  ...messagesForApi,
                  {
                    role: "assistant",
                    content: respData.answer,
                    sources: respData.sources,
                    toolsUsed: respData.tools_used,
                    suggestions: respData.suggested_followups,
                  },
                ];
                onUpdateThread?.(activeThread.id, updatedMessages);
                break;
              }
              case "error":
                dispatch({
                  type: "ERROR",
                  detail: (evt.data as { detail: string }).detail,
                });
                break;
            }
          },
          controller.signal,
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          dispatch({ type: "ERROR", detail: (err as Error).message });
        }
      }
    },
    [state.messages, activeThread, onUpdateThread],
  );

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  return {
    messages: state.messages,
    stream: state.stream,
    sendMessage,
    reset,
  };
}
