import { useEffect, useRef, useState } from "react";
import type { Session } from "./supabase";

type Props = {
  session: Session | null; unread: number;
  onSignIn: () => void; onMessages: () => void; onSettings: () => void; onLogout: () => void;
};

// The ☰ menu left of the logo: account, messages, settings and safety live here
// so the top bar stays uncluttered. Closes on pick, outside click or Esc.
export function NavMenu({ session, unread, onSignIn, onMessages, onSettings, onLogout }: Props) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  const close = (refocus = false) => { setOpen(false); setConfirming(false); if (refocus) toggle.current?.focus(); };
  useEffect(() => {
    if (!open) return;
    const outside = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) close(); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") close(true); };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", esc);
    ref.current?.querySelector<HTMLElement>(".nav-menu-panel button, .nav-menu-panel a")?.focus();
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", esc); };
  }, [open]);

  const pick = (fn: () => void) => () => { close(); fn(); };
  return <div className="nav-menu" ref={ref}>
    <button ref={toggle} type="button" className="nav-menu-toggle" aria-expanded={open} aria-controls="nav-menu-panel"
      aria-label={unread ? `Menu, ${unread} unread messages` : "Menu"} onClick={() => open ? close() : setOpen(true)}>
      <span aria-hidden="true" className="burger"><i /><i /><i /></span>
      {unread > 0 && <span className="unread-badge" aria-hidden="true">{unread}</span>}
    </button>
    {open && <div className="nav-menu-panel" id="nav-menu-panel" aria-label="Menu">
      <a href="#top" onClick={() => close()}>Home</a>
      {!session && <button type="button" onClick={pick(onSignIn)}>Sign in / Sign up</button>}
      {session && <button type="button" onClick={pick(onMessages)} aria-label={unread ? `Messages, ${unread} unread` : "Messages"}>
        Messages{unread > 0 && <span className="unread-badge" aria-hidden="true">{unread}</span>}
      </button>}
      {session && <button type="button" onClick={pick(onSettings)}>Settings</button>}
      <a href="#privacy-safety-questions" onClick={() => close()}>Privacy &amp; Safety</a>
      {session && (confirming
        ? <div className="nav-menu-confirm" role="group" aria-label="Confirm log out">
            <p>Log out of GearDrop?</p>
            <button type="button" className="danger" onClick={pick(onLogout)}>Log out</button>
            <button type="button" onClick={() => setConfirming(false)}>Cancel</button>
          </div>
        : <button type="button" className="danger" onClick={() => setConfirming(true)}>Log out account</button>)}
    </div>}
  </div>;
}
