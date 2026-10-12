import { createContext, useEffect, useRef, useState } from "react";
import { DEFAULT_PREFERENCES, readStored, validFavorites, validPreferences, writeStored, type Preferences } from "./preferences";
import { loadFavorites, loadPreferences, saveFavorite, savePreferences, type Session } from "./supabase";

export const PreferenceContext = createContext<Preferences>(DEFAULT_PREFERENCES);
const guestPreferences = ()=>validPreferences(readStored("geardrop:guest-preferences",DEFAULT_PREFERENCES));
const guestFavorites = ()=>validFavorites(readStored("geardrop:guest-favorites",[]));
export function useMarketplace(session: Session|null, notify:(message:string)=>void) {
  const [preferences,setPreferences]=useState(guestPreferences);
  const [favorites,setFavorites]=useState<string[]>(guestFavorites);
  const [ready,setReady]=useState(true),[busy,setBusy]=useState(false);
  const active=useRef(session?.user.id);active.current=session?.user.id;
  const pending=useRef(false);
  useEffect(()=>{
    let cancelled=false;const id=session?.user.id;
    setPreferences(id?DEFAULT_PREFERENCES:guestPreferences());setFavorites(id?[]:guestFavorites());setReady(!id);
    if(id) Promise.allSettled([loadPreferences(id),loadFavorites(id)]).then(results=>{
      if(cancelled)return;
      if(results[0].status==="fulfilled")setPreferences(results[0].value);
      if(results[1].status==="fulfilled")setFavorites(validFavorites(results[1].value));
      // Missing migration is reported when the user tries to save, rather than on every visit.
      setReady(true);
    });
    return()=>{cancelled=true;};
  },[session?.user.id]);
  async function save(value:Preferences){
    if(!ready)throw new Error("Your account preferences are still loading.");
    const id=active.current, next=validPreferences(value);
    if(id)await savePreferences(id,next);
    else if(!writeStored("geardrop:guest-preferences",next))throw new Error("Your browser could not save preferences. Please enable site storage.");
    if(active.current===id)setPreferences(next);
  }
  async function toggleFavorite(key:string){
    if(!ready||pending.current)return;
    pending.current=true;setBusy(true);const id=active.current;
    const enabled=!favorites.includes(key),next=enabled?[...favorites,key]:favorites.filter(k=>k!==key);
    try{
      if(id)await saveFavorite(id,key,enabled);
      else if(!writeStored("geardrop:guest-favorites",next))throw new Error("Your browser could not save favourites. Please enable site storage.");
      if(active.current===id)setFavorites(next);
    }catch(e){notify(e instanceof Error?e.message:"Could not save favourite.");}
    finally{pending.current=false;setBusy(false);}
  }
  return { preferences, favorites, ready, busy, save, toggleFavorite };
}
