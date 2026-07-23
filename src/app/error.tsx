"use client";

// App-wide error boundary. Catches any uncaught render error on any page and shows
// a friendly retry instead of a blank white screen (e.g. a brief DB blip that makes
// an API return an error body the page didn't expect). Self-contained inline styles
// so it renders even if app components/CSS are the thing that broke.
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App error boundary caught:", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0a0a0a",
        color: "#f5e6c8",
        fontFamily: "system-ui, -apple-system, sans-serif",
        padding: 24,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: 440 }}>
        <div style={{ fontSize: 42, marginBottom: 10 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 600, margin: "0 0 8px" }}>
          Something went wrong loading this page
        </h1>
        <p style={{ fontSize: 14, color: "#9ca3af", margin: "0 0 22px", lineHeight: 1.55 }}>
          This is almost always a brief hiccup talking to the database — it usually clears in a
          few seconds. Try again, and if it keeps happening give it a minute.
        </p>
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <button
            onClick={() => reset()}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "none",
              background: "#d4a853",
              color: "#0a0a0a",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: "9px 18px",
              borderRadius: 8,
              border: "1px solid #333",
              background: "transparent",
              color: "#f5e6c8",
              fontWeight: 500,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </div>
    </div>
  );
}
