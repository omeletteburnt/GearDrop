import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Listing } from "./data";
import { overlayClick, useModalA11y } from "./modal";
import { PERSONAS, PERSONA_COPY, PLATFORMS, type Preferences } from "./preferences";
import { updateListing } from "./supabase";
import { validateListingEdit } from "./listingEdits";

export function PreferenceFields({ value, onChange }: { value: Preferences; onChange: (p: Preferences)=>void }) {
  return <div className="preference-fields"><label>Gamer persona<select value={value.persona} onChange={e=>onChange({...value,persona:e.target.value as Preferences["persona"]})}>{PERSONAS.map(p=><option key={p} value={p}>{p==="default"?"Default (all gamers)":PERSONA_COPY[p].label}</option>)}</select></label><label>Gaming platform<select value={value.platform} onChange={e=>onChange({...value,platform:e.target.value as Preferences["platform"]})}><option value="">Any platform</option>{PLATFORMS.map(p=><option key={p} value={p}>{p.toUpperCase()}</option>)}</select></label></div>;
}

export function PersonaPicker({ value, save, close }: { value: Preferences; save:(p: Preferences)=>Promise<void>; close:()=>void }) {
  const [draft,setDraft]=useState(value),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const ref=useRef<HTMLDivElement>(null);useModalA11y(ref,close);
  async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError("");try{await save(draft);close();}catch(e){setError(e instanceof Error?e.message:"Could not save your choices.");}finally{setBusy(false);}}
  return <div className="overlay" onMouseDown={overlayClick(close)}><div className="sell-form" ref={ref} role="dialog" aria-modal="true" aria-label="Personalize GearDrop"><button className="close" aria-label="Close" onClick={close}>×</button><h2>Make GearDrop yours</h2><p>Optional: choose how you play. Your choices stay private.</p><form onSubmit={submit}><div className="persona-cards">{PERSONAS.filter(p=>p!=="default").map(p=><button className="btn secondary" type="button" key={p} aria-pressed={draft.persona===p} onClick={()=>setDraft({...draft,persona:p})}><b>{PERSONA_COPY[p].label}</b><small>{PERSONA_COPY[p].description}</small></button>)}</div><PreferenceFields value={draft} onChange={setDraft}/>{error&&<p role="alert" className="field-error">{error}</p>}<div className="settings-actions"><button type="button" className="btn secondary" disabled={busy} onClick={close}>Skip for now</button><button className="btn primary" disabled={busy}>{busy?"Saving…":"Save preferences"}</button></div></form></div></div>;
}

export function EditListing({ item, close, saved }: { item: Listing; close:()=>void; saved:(l:Listing)=>void }) {
  const [price,setPrice]=useState(String(item.price)),[status,setStatus]=useState(item.status);
  const [rows,setRows]=useState<[string,string][]>(Object.entries(item.specs));
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const ref=useRef<HTMLDivElement>(null);useModalA11y(ref,()=>{if(!busy)close();});
  async function submit(e:FormEvent){e.preventDefault();setError("");try{const patch=validateListingEdit(price,status,rows);setBusy(true);const updated=await updateListing(item,patch);saved(updated);close();}catch(e){setError(e instanceof Error?e.message:"Could not update this listing.");}finally{setBusy(false);}}
  return <div className="overlay" onMouseDown={overlayClick(()=>{if(!busy)close();})}><div className="sell-form" ref={ref} role="dialog" aria-modal="true" aria-label="Edit listing"><button className="close" aria-label="Close" disabled={busy} onClick={close}>×</button><h2>Edit {item.name}</h2><p>Update your price, specifications and availability.</p><form onSubmit={submit} noValidate><fieldset disabled={busy}><label>Price (USD)<input type="number" min="0.01" max="100000" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label><label>Availability<select value={status} onChange={e=>setStatus(e.target.value as Listing["status"])}>{["Available","Reserved","Sold"].map(s=><option key={s}>{s}</option>)}</select></label><h3>Specifications</h3>{rows.map(([key,value],i)=><div className="spec-edit" key={i}><label>Specification {i+1}<input maxLength={40} value={key} onChange={e=>setRows(rows.map((r,j)=>j===i?[e.target.value,r[1]]:r))}/></label><label>Value {i+1}<input maxLength={120} value={value} onChange={e=>setRows(rows.map((r,j)=>j===i?[r[0],e.target.value]:r))}/></label><button type="button" className="btn secondary" aria-label={`Remove specification ${i+1}`} onClick={()=>setRows(rows.filter((_,j)=>j!==i))}>Remove</button></div>)}<button type="button" className="btn secondary" disabled={rows.length>=12} onClick={()=>setRows([...rows,["",""]])}>Add specification</button>{!rows.length&&<p className="muted">Buyers will see a missing-specifications warning.</p>}{error&&<p className="field-error" role="alert">{error}</p>}<button className="btn primary submit">{busy?"Saving…":"Save listing"}</button></fieldset></form></div></div>;
}

export function PersonalizationSettings({ value, save }: { value:Preferences; save:(p:Preferences)=>Promise<void> }) {
  const [draft,setDraft]=useState(value),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  useEffect(()=>setDraft(value),[value]);
  async function apply(next:Preferences){setBusy(true);setMessage("");try{await save(next);setDraft(next);setMessage("Preferences saved.");}catch(e){setMessage(e instanceof Error?e.message:"Could not save.");}finally{setBusy(false);}}
  return <section><h3 className="settings-heading">Personalization</h3><p className="muted">Only you can see your persona and platform.</p><fieldset disabled={busy}><PreferenceFields value={draft} onChange={setDraft}/><div className="settings-actions"><button className="btn primary" onClick={()=>apply(draft)}>Save preferences</button><button className="btn secondary" onClick={()=>apply({persona:"default",platform:""})}>Reset to default</button></div></fieldset>{message&&<p role="status">{message}</p>}</section>;
}
