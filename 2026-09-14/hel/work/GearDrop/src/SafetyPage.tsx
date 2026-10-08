import { useEffect } from "react";
import "./safety.css";

// Every claim here matches how GearDrop is actually built (crypto.ts,
// supabase-*.sql row-level security, vercel.json headers, the nyx function).
// Keep it that way: change the page if the implementation changes.
const SECURITY: [string, string, string][] = [
  ["🔒", "End-to-end encrypted chats", "Messages, offers, photos, videos and PayNow details are encrypted in your browser (AES-256-GCM) before they're sent. Only you and the other person hold the keys, not GearDrop and not our database provider."],
  ["🗝️", "Your key, protected by your password", "Your chat key is backed up locked with your password, strengthened 600,000 times (PBKDF2) so it's very hard to guess. On a new device you unlock older chats with your password once."],
  ["🛡️", "A locked-down database", "Every table has row-level security switched on, so the database itself refuses to show or change anything you're not allowed to, even if someone tampers with the website."],
  ["🌐", "Secure connection only", "GearDrop only loads over HTTPS and tells browsers to never use an insecure connection. Strict security headers stop other sites from embedding GearDrop or injecting scripts into it."],
  ["💸", "We never touch your money", "Payment happens in your own banking app via PayNow, directly between buyer and seller, and only after both of you confirm the deal in the chat."],
  ["🧾", "Safe listings and messages", "Everything people type is shown as plain text, so a listing or message can't run harmful code on your device. Images only load from trusted sources."],
  ["🔑", "Passwords handled properly", "Sign-in is handled by Supabase Auth; GearDrop never stores your password itself. New passwords must be at least 12 characters."],
];

const CANT_SEE = ["What you write in chats, including offers, photos and videos", "PayNow QR codes and numbers you share", "Your chat key (it never leaves your devices unlocked)", "Your password"];
const CAN_SEE = ["Who you're chatting with, which listing it's about, and when messages were sent", "Your listings, reviews and username (these are public on GearDrop)", "When you asked Nyx a question, to apply the 20-a-day limit (not the question itself)"];

const TIPS: [string, string[]][] = [
  ["Buying", ["Read the full description and compare the specifications.", "Look for Nyx's missing-information notice and ask the seller about anything listed there.", "Ask about condition, faults, accessories and proof the item works before paying."]],
  ["Selling", ["Use your own photos and describe the condition honestly.", "Include the model, key specs, any faults, what's included and whether it's been tested.", "Only share your PayNow details once the deal is confirmed in the chat."]],
  ["Paying", ["Keep messages and offers on GearDrop until you've checked the item.", "Never pay before both sides have confirmed the deal in the chat.", "Check the recipient name and amount in your banking app before sending."]],
  ["Meeting up", ["Meet in a busy public place where possible.", "Bring a trusted person if you can.", "Test the item before you hand over money."]],
];

const QA: [string, [string, string][]][] = [
  ["Buying & selling", [
    ["What should I check before buying?", "Read the full description, compare specifications, and look for the missing-information notice. Ask the seller about condition, accessories, faults, and proof that the item works before paying."],
    ["How can I list gear responsibly?", "Use your own photos and give an honest condition description. Include important details such as model, specifications, faults, included accessories, and whether the item has been tested."],
  ]],
  ["Paying", [
    ["How do I pay safely?", "Keep payment and messages on GearDrop until you can verify the item. Do not share bank details, passwords, or one-time codes. Meet in a safe public place for collection where possible."],
    ["How does paying with PayNow work?", "The seller sends an offer in the chat, and either side can suggest a different price. Once one side accepts, both of you must confirm the deal. Only then can the seller share a PayNow QR code or PayNow mobile number. Pay directly in your own banking app: GearDrop never handles your money. Before confirming the transfer, check that the recipient name and the amount match what you agreed. Never pay before the deal is confirmed in the chat, and never share your bank login or one-time codes."],
  ]],
  ["Chats & privacy", [
    ["Are my GearDrop chats private?", "Yes. Messages, offers, photos, videos and PayNow details are end-to-end encrypted in your browser before they are sent, so only you and the other person can read them — not GearDrop, and not our database provider. What is not hidden: who you are chatting with, which listing it is about, and when messages were sent. Your chat key is protected by your password, so on a new device you will be asked for your password once to unlock older messages."],
    ["What happens to my questions to Nyx?", "To answer, your question and the listings it needs are sent to our AI provider (Groq). GearDrop doesn't save your Nyx chats; it only records when you asked, to apply the 20-questions-a-day limit. If you rate an answer 👍 or 👎, that rating, your question and the answer are shared with GearDrop admins to improve Nyx. You can download your own chat as a file at any time."],
  ]],
  ["Staying safe", [
    ["How do I block someone?", "Open the conversation and tap Block in the top corner. Neither of you can send messages in that chat until you unblock them, which you can do from the same button."],
    ["What should I do if something feels suspicious?", "Stop the conversation, do not send money or personal information, and leave the transaction. Block the user, then report that listing."],
  ]],
];

const JUMPS: [string, string][] = [["Security", "safety-security"], ["Privacy", "safety-privacy"], ["Tips", "safety-tips"], ["Q&A", "safety-questions"]];

// Buttons, not #links: the URL hash decides which page is shown.
const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });

export function SafetyPage() {
  useEffect(() => { if (window.location.hash === "#privacy-safety-questions") jump("safety-questions"); }, []);
  return <section className="safety-page">
    <div className="safety-hero"><div className="orbs" aria-hidden="true"><i/><i/><i/></div>
      <p className="eyebrow">PRIVACY &amp; SAFETY</p>
      <h1>Trade smart.<br/><i>Game</i> safely.</h1>
      <p>How GearDrop protects you, what we can and can't see, and how to buy and sell pre-loved gear safely.</p>
      <div className="safety-jumps" role="navigation" aria-label="On this page">{JUMPS.map(([label, id]) => <button key={id} type="button" onClick={() => jump(id)}>{label}</button>)}</div>
    </div>

    <section className="safety-block safety-security" id="safety-security" aria-labelledby="safety-security-h">
      <p className="eyebrow">SECURITY</p>
      <h2 id="safety-security-h">How GearDrop keeps you secure</h2>
      <div className="safety-cards">{SECURITY.map(([icon, title, text]) => <article key={title}><span className="safety-icon" aria-hidden="true">{icon}</span><b>{title}</b><p>{text}</p></article>)}</div>
    </section>

    <section className="safety-block" id="safety-privacy" aria-labelledby="safety-privacy-h">
      <p className="eyebrow">PRIVACY</p>
      <h2 id="safety-privacy-h">What we can and can't see</h2>
      <div className="safety-see">
        <article className="cant"><b>GearDrop can't see</b><ul>{CANT_SEE.map(x => <li key={x}>{x}</li>)}</ul></article>
        <article className="can"><b>GearDrop can see</b><ul>{CAN_SEE.map(x => <li key={x}>{x}</li>)}</ul></article>
      </div>
    </section>

    <section className="safety-block safety-tips" id="safety-tips" aria-labelledby="safety-tips-h">
      <p className="eyebrow">SAFETY TIPS</p>
      <h2 id="safety-tips-h">Trade safely, step by step</h2>
      <div className="safety-cards four">{TIPS.map(([title, tips]) => <article key={title}><b>{title}</b><ul>{tips.map(t => <li key={t}>{t}</li>)}</ul></article>)}</div>
    </section>

    <section className="safety-block safety-questions" id="safety-questions" aria-labelledby="safety-questions-h">
      <p className="eyebrow">Q&amp;A</p>
      <h2 id="safety-questions-h">Questions, answered.</h2>
      {QA.map(([topic, items]) => <div className="safety-topic" key={topic}><h3>{topic}</h3>{items.map(([q, a]) => <details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>)}
    </section>

    <section className="safety-block safety-report" aria-labelledby="safety-report-h">
      <div><h2 id="safety-report-h">Spotted something wrong?</h2>
        <p>If a listing or user seems suspicious: stop replying, don't send money or personal details, block them from the chat, and report that listing.</p></div>
    </section>

    <a className="back-market" href="#top">← Back to marketplace</a>
  </section>;
}
