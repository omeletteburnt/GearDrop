import { useEffect, useRef, useState } from "react";
import type { Session } from "./supabase";
import { overlayClick, useModalA11y } from "./modal";
import { nyxStats, type NyxStats } from "./nyx";
import { PersonalizationSettings } from "./MarketplaceTools";
import { PasswordReset, RecoveryRequest } from "./RecoveryUI";
import type { Preferences } from "./preferences";

export function Settings({ session, admin, close, preferences, savePreferences, notify }: { session:Session; admin:boolean; close:()=>void; preferences:Preferences; savePreferences:(p:Preferences)=>Promise<void>; notify:(message:string)=>void }) {
  const [stats,setStats]=useState<NyxStats|null>(null);
  const [changingPassword,setChangingPassword]=useState(false);
  const [recoveryRequest,setRecoveryRequest]=useState(false);
  useEffect(()=>{if(admin)nyxStats().then(setStats);},[admin]);
  const ref=useRef<HTMLDivElement>(null);useModalA11y(ref,close);
  return <><div className="overlay" onMouseDown={overlayClick(close)}><div className="sell-form settings" ref={ref} role="dialog" aria-modal="true" aria-label="Account settings">
    <button className="close" onClick={close} aria-label="Close">×</button>
    <p className="eyebrow">SETTINGS</p><h2>Your preferences</h2>
    <PersonalizationSettings value={preferences} save={savePreferences}/>
    <h3 className="settings-heading">Password</h3>
    <p className="muted">Change your password using your current password. Your encrypted chat backup will be preserved.</p>
    <button className="btn secondary" onClick={()=>setChangingPassword(true)}>Change password</button>
    <button className="example" onClick={()=>setRecoveryRequest(true)}>Reset password by email</button>
    {admin&&<><h3 className="settings-heading">Nyx usage (admin)</h3>{!stats?<p className="muted">Loading…</p>:<dl className="settings-list nyx-stats">
      <div><dt>Questions in the last 24 h</dt><dd>{stats.questions_today}</dd></div>
      <div><dt>People who asked (24 h)</dt><dd>{stats.users_today}</dd></div>
      <div><dt>Feedback, last 7 days</dt><dd>👍 {stats.helpful_7d} · 👎 {stats.unhelpful_7d}</dd></div>
    </dl>}</>}
  </div></div>{changingPassword&&<PasswordReset mode="change" expectedUserId={session.user.id} close={()=>setChangingPassword(false)} notify={message=>{notify(message);close();}}/>}{recoveryRequest&&<RecoveryRequest close={()=>setRecoveryRequest(false)}/>}</>;
}
