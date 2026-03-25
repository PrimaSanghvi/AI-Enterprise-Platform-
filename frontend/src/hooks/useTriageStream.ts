import { useCallback, useReducer, useRef } from "react";
import { streamTriage } from "../api/triage";
import type {
  StreamEvent,
  ToolCallEvent,
  ToolResultEvent,
  TriageErrorEvent,
  TriageOutput,
  TriageStreamState,
} from "../types/triage";

type Action =
  | { type: "START" }
  | { type: "TOOL_CALL"; data: ToolCallEvent }
  | { type: "TOOL_RESULT"; data: ToolResultEvent }
  | { type: "RESULT"; data: TriageOutput }
  | { type: "ERROR"; data: TriageErrorEvent }
  | { type: "RESET" };

const initial: TriageStreamState = {
  status: "idle",
  events: [],
  result: null,
  error: null,
};

function reducer(state: TriageStreamState, action: Action): TriageStreamState {
  switch (action.type) {
    case "START":
      return { status: "streaming", events: [], result: null, error: null };
    case "TOOL_CALL":
      return {
        ...state,
        events: [
          ...state.events,
          { type: "tool_call", data: action.data } as StreamEvent,
        ],
      };
    case "TOOL_RESULT":
      return {
        ...state,
        events: [
          ...state.events,
          { type: "tool_result", data: action.data } as StreamEvent,
        ],
      };
    case "RESULT":
      return { ...state, status: "done", result: action.data };
    case "ERROR":
      return { ...state, status: "error", error: action.data };
    case "RESET":
      return initial;
    default:
      return state;
  }
}

export function useTriageStream() {
  const [state, dispatch] = useReducer(reducer, initial);
  const abortRef = useRef<AbortController | null>(null);

  const startTriage = useCallback(async (dealId: string) => {
    // Cancel any in-progress stream
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    dispatch({ type: "START" });

    try {
      await streamTriage(
        dealId,
        (evt) => {
          switch (evt.event) {
            case "tool_call":
              dispatch({ type: "TOOL_CALL", data: evt.data as unknown as ToolCallEvent });
              break;
            case "tool_result":
              dispatch({ type: "TOOL_RESULT", data: evt.data as unknown as ToolResultEvent });
              break;
            case "result":
              dispatch({ type: "RESULT", data: evt.data as unknown as TriageOutput });
              break;
            case "error":
              dispatch({ type: "ERROR", data: evt.data as unknown as TriageErrorEvent });
              break;
          }
        },
        controller.signal,
      );
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        dispatch({
          type: "ERROR",
          data: { detail: (err as Error).message, raw_text: "" },
        });
      }
    }
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    dispatch({ type: "RESET" });
  }, []);

  return { state, startTriage, reset };
}
