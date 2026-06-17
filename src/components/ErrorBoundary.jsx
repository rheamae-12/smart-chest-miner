import { Component } from "react";
import { C, ghostButtonStyle } from "../theme";

// ErrorBoundary — catches render errors in the page tree so a single broken
// module never white-screens the whole monitoring console. Safety-critical UI
// must degrade gracefully and stay navigable.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface to the console for debugging; a production build could forward
    // this to a logging endpoint.
    console.error("Page render error:", error, info?.componentStack);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div style={{ height: "100%", minHeight: 280, display: "grid", placeItems: "center", padding: 24 }}>
        <div style={{ maxWidth: 440, textAlign: "center" }}>
          <div style={{ color: C.red, fontSize: 13, fontWeight: 950, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            This module hit an error
          </div>
          <div style={{ color: C.textMuted, fontSize: 13, lineHeight: 1.6, marginTop: 10 }}>
            The rest of the console is still running. Live monitoring and alerts continue in the background.
          </div>
          {this.state.error?.message && (
            <div style={{ color: C.textDim, fontSize: 11, fontFamily: "monospace", marginTop: 12, padding: "9px 12px", background: "rgba(255,255,255,0.03)", border: `1px solid ${C.borderSoft}`, borderRadius: 7, wordBreak: "break-word" }}>
              {this.state.error.message}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 16 }}>
            <button onClick={this.reset} style={{ ...ghostButtonStyle, padding: "9px 16px" }}>Try Again</button>
            <button onClick={() => window.location.reload()} style={{ ...ghostButtonStyle, padding: "9px 16px" }}>Reload Console</button>
          </div>
        </div>
      </div>
    );
  }
}
