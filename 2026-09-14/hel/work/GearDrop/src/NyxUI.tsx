import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Listing } from "./data";
import type { Session } from "./supabase";
import { NyxFace, type NyxMood } from "./NyxFace";
import { countWords, murmurAt, murmurWords, revealWords } from "./murmur";
import { askNyx, chatFromDoc, downloadChat, NYX_DAILY_LIMIT, nyxRemaining, sendNyxFeedback, splitAnswer, type NyxMode, type NyxTurn } from "./nyx";

// **bold** inside a line, rendered as React text (never as HTML).
function inline(text: string, key: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.startsWith("**") && part.endsWith("**") && part.length > 4 ? <b key={`${key}-${i}`}>{part.slice(2, -2)}</b> : part);
}

// Minimal formatting for answers: paragraphs, "- " bullets, **bold**, and
// [[listing:ID]] turned into a button that opens the listing.
export function NyxAnswer({ text, items, onOpen }: { text: string; items: Listing[]; onOpen: (l: Listing) => void }) {
  const blocks: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  const flush = () => { if (bullets.length) { blocks.push(<ul key={`ul-${blocks.length}`}>{bullets}</ul>); bullets = []; } };
  const renderLine = (line: string, key: string) => splitAnswer(line).map((p, i) => {
    if ("text" in p) return <span key={`${key}-${i}`}>{inline(p.text, `${key}-${i}`)}</span>;
    const item = items.find(x => x.id === p.listingId);
    return item ? <button key={`${key}-${i}`} type="button" className="nyx-listing-link" onClick={() => onOpen(item)}>View · ${item.price}</button> : null;
  });
  text.split("\n").forEach((raw, n) => {
    const line = raw.trimEnd();
    const bullet = line.match(/^\s*[-*•]\s+(.*)$/);
    if (bullet) { bullets.push(<li key={n}>{renderLine(bullet[1], `l${n}`)}</li>); return; }
    flush();
    if (line.trim()) blocks.push(<p key={n}>{renderLine(line.replace(/^#+\s*/, ""), `p${n}`)}</p>);
  });
  flush();
  return <div className="nyx-answer-body">{blocks}</div>;
}

// Faint words from the question, drifting past while Nyx thinks/reads.
function Murmur({ question }: { question: string }) {
  const [words] = useState(() => murmurWords(question));
  const [at, setAt] = useState(0);
  useEffect(() => { const t = setInterval(() => setAt(a => a + 1), 900); return () => clearInterval(t); }, []);
  return <span className="nyx-murmur" aria-hidden="true" key={at}>{murmurAt(words, at)}…</span>;
}

const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function Feedback({ session, question, answer }: { session: Session; question: string; answer: string }) {
  const [state, setState] = useState<"idle" | "sent" | "error">("idle");
  async function send(helpful: boolean) {
    try { await sendNyxFeedback(session.user.id, helpful, question, answer); setState("sent"); } catch { setState("error"); }
  }
  if (state === "sent") return <small className="nyx-feedback">Thanks for the feedback!</small>;
  return <div className="nyx-feedback">
    <small>Helpful?</small>
    <button type="button" aria-label="Helpful" onClick={() => send(true)}>👍</button>
    <button type="button" aria-label="Not helpful" onClick={() => send(false)}>👎</button>
    <small className="nyx-feedback-note">{state === "error" ? "Couldn’t send. Try again." : "Your rating, question and this answer are shared with GearDrop admins."}</small>
  </div>;
}

type Props = {
  session: Session | null; items: Listing[]; onOpen: (l: Listing) => void; requestSignIn: () => void;
  mode?: NyxMode; focusIds?: number[]; label: string; placeholder: string; saveable?: boolean;
  draft?: string; onDraftUsed?: () => void;
  heading?: ReactNode; // shown beside a mini Nyx face that reacts to this chat
};

// One Nyx conversation. The main panel can save/import it as a .doc file;
// the listing and compare boxes use the same thread with their listings attached.
export function NyxThread({ session, items, onOpen, requestSignIn, mode = "general", focusIds, label, placeholder, saveable, draft, onDraftUsed, heading }: Props) {
  const [turns, setTurns] = useState<NyxTurn[]>([]);
  const [input, setInput] = useState(""); const [busy, setBusy] = useState(false);
  const [error, setError] = useState(""); const [remaining, setRemaining] = useState<number | null>(null);
  const [happy, setHappy] = useState(false);
  // The newest live answer types itself out; imported chats never do.
  const [typing, setTyping] = useState<{ index: number; shown: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (session) nyxRemaining().then(setRemaining); else setRemaining(null); }, [session]);
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); }, [turns, busy, typing]);
  useEffect(() => { if (!happy) return; const t = setTimeout(() => setHappy(false), 2000); return () => clearTimeout(t); }, [happy]);
  useEffect(() => {
    if (!typing) return;
    const total = countWords(turns[typing.index]?.text ?? "");
    if (typing.shown >= total) { setTyping(null); setHappy(true); return; }
    const step = Math.max(1, Math.ceil(total / 170)); // ~35 ms per tick, long answers capped near 6 s
    const t = setTimeout(() => setTyping(v => v && { ...v, shown: v.shown + step }), 35);
    return () => clearTimeout(t);
  }, [typing, turns]);
  // A one-click prompt from outside (e.g. "Try an example").
  useEffect(() => { if (draft) { setInput(draft); onDraftUsed?.(); } }, [draft, onDraftUsed]);

  async function ask(e?: FormEvent) {
    e?.preventDefault();
    const question = input.trim();
    if (!question || busy) return;
    if (!session) { requestSignIn(); return; }
    setBusy(true); setError("");
    const history = turns;
    setTurns([...history, { role: "user", text: question }]); setInput("");
    try {
      const reply = await askNyx(question, { mode, items, focusIds, history });
      setTurns(t => [...t, { role: "nyx", text: reply.answer }]);
      if (reducedMotion()) setHappy(true); else setTyping({ index: history.length + 1, shown: 0 });
      if (reply.remaining !== null) setRemaining(reply.remaining);
    } catch (err) {
      setTurns(history); setHappy(false); setInput(question); // give the question back so it can be retried
      setError(err instanceof Error ? err.message : "Nyx couldn't answer right now.");
      const left = (err as { remaining?: number }).remaining;
      if (typeof left === "number") setRemaining(left);
    } finally { setBusy(false); }
  }

  async function importChat(file: File | undefined) {
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    setError("");
    try {
      if (file.size > 2_000_000) throw new Error("That file is too big to be a saved Nyx chat.");
      const imported = chatFromDoc(await file.text());
      if (!imported.length) throw new Error("That saved chat is empty.");
      setTyping(null); setTurns(imported);
    } catch (err) { setError(err instanceof Error ? err.message : "Could not import that file."); }
  }

  const out = remaining === 0;
  const mood: NyxMood = busy ? "thinking" : typing ? "talking" : error || out ? "sad" : happy ? "happy" : "idle";
  const lastNyx = turns.map(t => t.role).lastIndexOf("nyx");
  return <div className={`nyx-thread${saveable ? " main" : ""}`}>
    {heading && <div className="nyx-head"><NyxFace mood={mood} /><div>{heading}</div></div>}
    {turns.length > 0 && <div className="nyx-messages" ref={listRef} aria-live="polite">
      {turns.map((t, i) => t.role === "user"
        ? <p key={i} className="nyx-q">{t.text}</p>
        : typing?.index === i
          ? <div key={i} className="nyx-answer with-face typing" title="Click to show the whole answer" onClick={() => setTyping(v => v && { ...v, shown: Infinity })}>
              <NyxFace size="tiny" mood="talking" />
              <div className="nyx-answer-content">
                <Murmur question={turns[i - 1]?.text ?? ""} />
                <span className="sr-only">{t.text}</span>
                <div aria-hidden="true"><NyxAnswer text={revealWords(t.text, typing.shown)} items={items} onOpen={onOpen} /></div>
              </div>
            </div>
          : <div key={i} className="nyx-answer with-face"><NyxFace size="tiny" mood={i === lastNyx ? mood : "idle"} still={i !== lastNyx || busy} /><div className="nyx-answer-content"><NyxAnswer text={t.text} items={items} onOpen={onOpen} />{session && <Feedback session={session} question={turns[i - 1]?.text ?? ""} answer={t.text} />}</div></div>)}
      {busy && <p className="nyx-answer with-face"><NyxFace size="tiny" mood="thinking" /><span className="nyx-answer-content"><span className="sr-only">Nyx is thinking…</span>{reducedMotion() ? <span className="nyx-thinking">Nyx is thinking…</span> : <Murmur question={turns[turns.length - 1]?.text ?? ""} />}</span></p>}
    </div>}
    <form onSubmit={ask}>
      <label>{label}
        <textarea value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder} maxLength={1500} disabled={busy}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }} />
      </label>
      <div className="nyx-actions">
        <button className="nyx-send" disabled={busy || !input.trim() || out}>{busy ? "Thinking…" : "Ask Nyx →"}</button>
        {!session && <small className="nyx-left">Sign in to use Nyx (free, {NYX_DAILY_LIMIT} questions a day)</small>}
        {session && remaining !== null && <small className="nyx-left">{out ? "No questions left today" : `${remaining} of ${NYX_DAILY_LIMIT} questions left today`}</small>}
      </div>
    </form>
    {saveable && <div className="nyx-file">
      {turns.length > 0 && <button type="button" className="example" onClick={() => downloadChat(turns)}>Download chat (.doc)</button>}
      <button type="button" className="example" onClick={() => fileRef.current?.click()}>Import chat</button>
      {turns.length > 0 && <button type="button" className="example" onClick={() => { setTyping(null); setTurns([]); setError(""); }}>New chat</button>}
      <input ref={fileRef} type="file" accept=".doc,.html,.htm" hidden onChange={e => importChat(e.target.files?.[0])} />
    </div>}
    {error && <p className="field-error" role="alert">{error}</p>}
    {turns.some(t => t.role === "nyx") && <small className="nyx-disclaimer">Nyx is an AI and can make mistakes. Check important details with the seller.</small>}
  </div>;
}
