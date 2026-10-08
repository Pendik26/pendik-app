import { AlfondChat } from "../components/alfond/AlfondChat";
import { AlfondOverlaySetting } from "../components/alfond/AlfondSetting";
import { clearAlfond, useAlfond } from "../lib/alfond";

/** Alfond's own page: the same conversation as the overlay, full size, and its setting. */
export function AlfondPage() {
  const { messages } = useAlfond();
  return (
    <section className="page alfond-page">
      <div className="alfond-page-head">
        <div>
          <h1>Alfond</h1>
          <p className="subtitle">
            Your study assistant. Ask anything here, or open Alfond from any page to ask about what's on screen.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={clearAlfond} disabled={messages.length === 0}>
          New chat
        </button>
      </div>
      <div className="alfond-page-chat">
        <AlfondChat variant="page" autoFocus />
      </div>
      <div className="alfond-page-settings" id="settings">
        <AlfondOverlaySetting />
      </div>
    </section>
  );
}
