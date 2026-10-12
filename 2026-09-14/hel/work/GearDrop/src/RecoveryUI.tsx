import { useEffect, useRef, useState, type FormEvent } from "react";
import { friendlyAuthError, isEmailLike, isPlaceholderEmail, supabase } from "./supabase";
import { overlayClick, useModalA11y } from "./modal";
import { unwrapPrivateKeyBytes, wrapPrivateKey, type WrappedKey } from "./crypto";
import { clearLocalKeys, forgetConversationKeys } from "./chat";

export function useRecovery() {
  const [recovering,setRecovering]=useState(false);
  useEffect(()=>{
    const {data}=supabase.auth.onAuthStateChange((event)=>{if(event==="PASSWORD_RECOVERY")setRecovering(true);});
    // A refresh of the recovery page still opens the reset form. Auth validates the session.
    const route=()=>{if(window.location.hash.startsWith("#reset-password"))setRecovering(true);};
    route();window.addEventListener("hashchange",route);
    return()=>{data.subscription.unsubscribe();window.removeEventListener("hashchange",route);};
  },[]);
  return {recovering,finish:()=>{setRecovering(false);history.replaceState(null,"",window.location.pathname);}};
}

export function RecoveryRequest({close}:{close:()=>void}) {
  const [email,setEmail]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState(""),[sent,setSent]=useState(false);
  const ref=useRef<HTMLDivElement>(null);useModalA11y(ref,close);
  async function submit(e:FormEvent){e.preventDefault();setError("");if(!isEmailLike(email)||isPlaceholderEmail(email)){setError("Enter the real email address added to your account.");return;}setBusy(true);try{const{error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:`${window.location.origin}/#reset-password`});if(error)throw new Error("Could not request recovery. Please wait a moment and try again.");setSent(true);}catch(e){setError(e instanceof Error?e.message:"Could not send the link.");}finally{setBusy(false);}}
  return <div className="overlay" onMouseDown={overlayClick(close)}><div className="sell-form" ref={ref} role="dialog" aria-modal="true" aria-label="Recover account"><button className="close" aria-label="Close" onClick={close}>×</button><h2>Forgot your password?</h2><p>You need a real email previously added to your account. Accounts without one cannot use email recovery.</p>{sent?<p role="status">If an eligible account uses that email, a recovery link is on its way. Check your inbox and spam folder.</p>:<form onSubmit={submit} noValidate><label>Account email<input type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>{error&&<p role="alert" className="field-error">{error}</p>}<button className="btn primary" disabled={busy}>{busy?"Sending…":"Send recovery link"}</button></form>}</div></div>;
}

export function PasswordReset({close,notify,mode="recovery",expectedUserId}:{close:()=>void;notify:(s:string)=>void;mode?:"recovery"|"change";expectedUserId?:string}) {
  const [password,setPassword]=useState(""),[confirm,setConfirm]=useState(""),[oldPassword,setOldPassword]=useState("");
  const [ack,setAck]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(""),[changed,setChanged]=useState(false);
  const prepared=useRef<{userId:string;wrapped:WrappedKey|null}|null>(null);
  const ref=useRef<HTMLDivElement>(null);useModalA11y(ref,()=>{if(!busy&&!changed)close();});
  async function submit(e:FormEvent){
    e.preventDefault();setError("");
    if(!changed&&mode==="change"&&!oldPassword){setError("Enter your current password.");return;}
    if(!changed && (password.length<12||password!==confirm)){setError("Use at least 12 characters and make sure both new passwords match.");return;}
    setBusy(true);
    try{
      if(!changed){
        const {data:{user},error:authError}=await supabase.auth.getUser();
        if(authError||!user)throw new Error(mode==="change"?"Your session expired. Sign in again.":"Your recovery link has expired. Request a new link.");
        if(expectedUserId&&user.id!==expectedUserId)throw new Error("The account changed. Please reopen Settings.");
        if(mode==="change"){
          const verified=await supabase.auth.signInWithPassword({email:user.email??"",password:oldPassword});
          if(verified.error||verified.data.user?.id!==user.id)throw new Error("Incorrect current password.");
        }
        const {data:backup,error:backupError}=await supabase.from("key_backups").select("wrapped_key,salt,iv").eq("user_id",user.id).maybeSingle();
        if(backupError)throw new Error("Could not check your chat-key backup. Your password has not been changed.");
        let wrapped:WrappedKey|null=null;
        if(backup && oldPassword){
          let bytes:Uint8Array<ArrayBuffer>;
          try{bytes=await unwrapPrivateKeyBytes(backup as WrappedKey,oldPassword);}catch{throw new Error("The previous password could not unlock your chat backup. Try again or leave it empty and acknowledge the chat warning.");}
          try{wrapped=await wrapPrivateKey(bytes,password);}finally{bytes.fill(0);}
        }else if(backup && !ack)throw new Error("Acknowledge the encrypted-chat warning before continuing without your previous password.");
        prepared.current={userId:user.id,wrapped};
        const {error}=await supabase.auth.updateUser({password});
        if(error)throw new Error(friendlyAuthError(error.message));
        setChanged(true);
      }
      const state=prepared.current;
      if(state?.wrapped){
        const {error}=await supabase.from("key_backups").upsert({user_id:state.userId,...state.wrapped});
        if(error)throw new Error("Your password changed, but your chat backup could not be updated. Keep this window open and choose Retry chat backup.");
      }
      // Without the old password, preserve the old backup/public key. Never replace it.
      await clearLocalKeys();forgetConversationKeys();
      await supabase.auth.signOut({scope:"global"});
      notify(state?.wrapped?"Password updated and chat backup preserved. Sign in with your new password.":"Password updated. Existing chat keys were preserved; unlocking the old backup may still require your previous password.");
      close();
    }catch(e){setError(e instanceof Error?e.message:"Could not update your password.");}finally{setBusy(false);}
  }
  return <div className="overlay"><div className="sell-form" ref={ref} role="dialog" aria-modal="true" aria-label={mode==="change"?"Change password":"Reset password"}><button className="close" aria-label="Close" disabled={busy||changed} onClick={close}>×</button><h2>{mode==="change"?"Change your password":"Choose a new password"}</h2><form onSubmit={submit} noValidate>{!changed&&<><label>New password<input type="password" autoComplete="new-password" value={password} onChange={e=>setPassword(e.target.value)}/></label><label>Confirm new password<input type="password" autoComplete="new-password" value={confirm} onChange={e=>setConfirm(e.target.value)}/></label><label>{mode==="change"?"Current password":"Previous password (optional)"}<input type="password" autoComplete={mode==="change"?"current-password":"off"} value={oldPassword} onChange={e=>setOldPassword(e.target.value)}/><small>{mode==="change"?"Confirm it is you and preserve your encrypted chat backup.":"Provide it to move your encrypted chat backup to your new password."}</small></label>{mode==="recovery"&&<div className="recovery-warning"><p>Without your previous password, we cannot re-encrypt your existing chat backup. Old messages may remain locked, and we will preserve the old keys rather than overwrite them.</p><label><input type="checkbox" checked={ack} onChange={e=>setAck(e.target.checked)}/>I understand the encrypted-chat limitation.</label></div>}</>}{error&&<p role="alert" className="field-error">{error}</p>}<button className="btn primary" disabled={busy}>{busy?"Updating…":changed?"Retry chat backup":"Update password"}</button></form></div></div>;
}
