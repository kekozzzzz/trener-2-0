"use client";

import { useActionState } from "react";
import { submitAnswerAction, type AnswerFormState } from "./actions";

const initialState: AnswerFormState = {};

export function AnswerForm({ tournamentId, handId }: { tournamentId: string; handId: string }) {
  const action = submitAnswerAction.bind(null, tournamentId, handId);
  const [state, formAction, pending] = useActionState(action, initialState);

  return (
    <form action={formAction} style={{ marginTop: "1rem" }}>
      <textarea
        name="answer"
        rows={4}
        placeholder="Твой ответ..."
        style={{ width: "100%", fontFamily: "monospace", padding: "0.5rem", boxSizing: "border-box" }}
      />
      {state.error && (
        <p style={{ color: "#991b1b", fontSize: "0.85em", marginTop: "0.25rem" }}>{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        style={{
          fontFamily: "monospace",
          padding: "4px 12px",
          cursor: "pointer",
          border: "1px solid #374151",
          borderRadius: "4px",
          background: "#f9fafb",
          marginTop: "0.5rem",
        }}
      >
        {pending ? "Отправляем..." : "Ответить"}
      </button>
    </form>
  );
}
