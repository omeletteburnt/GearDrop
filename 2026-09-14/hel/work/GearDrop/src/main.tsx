import { useEffect, useMemo, useRef, useState, type FormEvent, type SyntheticEvent } from "react";
import { createRoot } from "react-dom/client";
import { categories, starterListings, type Category, type Listing } from "./data";
import { canConfirmEmailRemoval, deleteListing, getSession, getUsername, REMOVE_EMAIL_FLAG, isAdmin, isEmailLike, loadListings, onSessionChange, saveListing, signIn, signOut, signUp, type Session } from "./supabase";
import { safeImageUrl, validateListing } from "./validation";
import { overlayClick, useModalA11y } from "./modal";
import { clearLocalKeys, deliverHeld, forgetConversationKeys, openConversation, setupChatKeys, type Conversation } from "./chat";
import { ChatWindow, Inbox, useUnread } from "./ChatUI";
import { Settings } from "./Settings";
import { ratingSummary, type Rating } from "./reviews";
import { RatingBadge, ReviewList } from "./ReviewsUI";
import "./reviews.css";
import { NyxThread } from "./NyxUI";
import "./nyx.css";
import "./chat.css";
import "./settings.css";
import "./tokens.css";
import "./styles.css";
import "./theme.css";
import "./compare.css";
import "./delete.css";
import "./motion.css";
import { installRipple } from "./ripple";
import { NavMenu } from "./NavMenu";
import { SafetyPage } from "./SafetyPage";
import "./navmenu.css";
import { installStack, scrollToSection } from "./stack";
import { NyxMascot } from "./NyxMascot";

const photos: Record<Category,string> = {
  "PC/Laptops":"https://images.unsplash.com/photo-1587202372775-e229f172b9d7?auto=format&fit=crop&w=900&q=80",
  Keyboards:"https://images.unsplash.com/photo-1587829741301-dc798b83add3?auto=format&fit=crop&w=900&q=80",
  Mouses:"https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=900&q=80",
  Mics:"https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&w=900&q=80",
  Headsets:"https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=900&q=80"
};
function App() {
  const [items,setItems]=useState(starterListings); const [category,setCategory]=useState<Category|"All">("All");
  const [search,setSearch]=useState(""); const [nyxDraft,setNyxDraft]=useState(""); const [nyxHi,setNyxHi]=useState(false); useEffect(()=>{if(!nyxHi)return;const t=setTimeout(()=>setNyxHi(false),1200);return()=>clearTimeout(t);},[nyxHi]);
  const [selected,setSelected]=useState<Listing|null>(null); const [selling,setSelling]=useState(false); const [toast,setToast]=useState(""); useEffect(()=>{if(!toast)return;const t=setTimeout(()=>setToast(""),4000);return()=>clearTimeout(t);},[toast]); /* every message hides itself after 4 s */ const [session,setSession]=useState<Session|null>(null); const [admin,setAdmin]=useState(false); const [auth,setAuth]=useState(false); const [compare,setCompare]=useState<Listing[]>([]); const [deleteCandidate,setDeleteCandidate]=useState<Listing|null>(null);
  // Deliver any "waiting to deliver" messages whose recipient has since signed in.
  useEffect(()=>{if(session)deliverHeld(session.user.id).catch(()=>undefined);},[session?.user.id]);
  const [inbox,setInbox]=useState(false); const [settings,setSettings]=useState(false);
  // Back from the "remove my email" link: reopen Settings for the final confirm.
  useEffect(()=>{if(session&&localStorage.getItem(REMOVE_EMAIL_FLAG)&&canConfirmEmailRemoval(session))setSettings(true);},[session]); const [chat,setChat]=useState<Conversation|null>(null); const [unread,refreshUnread]=useUnread(session);
  const [theme,setTheme]=useState<"light"|"dark">(() => window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const [page,setPage]=useState(()=>window.location.hash.startsWith("#privacy-safety")?"safety":"market");
  useEffect(()=>{document.documentElement.dataset.theme=theme;},[theme]);
  useEffect(()=>{getSession().then(setSession);return onSessionChange(setSession);},[]);
  useEffect(()=>{if(!session){setAdmin(false);return;}isAdmin().then(setAdmin);},[session]);
  // Listings are always sold under your real username (the database enforces this too).
  const [username,setUsername]=useState<string|null>(null);
  useEffect(()=>{if(!session){setUsername(null);return;}getUsername(session.user.id).then(setUsername);},[session?.user.id]);
  useEffect(()=>{const update=()=>setPage(window.location.hash.startsWith("#privacy-safety")?"safety":"market");window.addEventListener("hashchange",update);return()=>window.removeEventListener("hashchange",update);},[]);const firstPage=useRef(true);useEffect(()=>{if(firstPage.current){firstPage.current=false;return;}/* switching pages: land on the linked section, else the top (the safety page handles its own Q&A link) */const id=window.location.hash.slice(1);const el=id?document.getElementById(id):null;if(page==="market"&&el)scrollToSection(el);else if(id!=="privacy-safety-questions")window.scrollTo(0,0);},[page]);
  const [listingsLoading,setListingsLoading]=useState(true);
  const [ratings,setRatings]=useState<Record<string,Rating>>({});
  const ownerKey=[...new Set(items.flatMap(x=>x.ownerId?[x.ownerId]:[]))].sort().join(",");
  const refreshRatings=()=>{ratingSummary(ownerKey?ownerKey.split(","):[]).then(setRatings).catch(()=>undefined);};
  useEffect(refreshRatings,[ownerKey]);
  useEffect(()=>{loadListings().then(remote=>{if(remote.length)setItems([...remote.map(item=>({...item,id:item.id+1000000})),...starterListings]);}).finally(()=>setListingsLoading(false));},[]);
  const shown=useMemo(()=>items.filter(x=>(category==="All"||x.category===category)&&(x.name+" "+x.description).toLowerCase().includes(search.toLowerCase())),[items,category,search]);
  async function submit(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!session){setSelling(false);setAuth(true);return;}const f=new FormData(e.currentTarget);const details=String(f.get("details"));if(!username){setToast("Your profile is still loading. Please try again in a moment.");setTimeout(()=>setToast(""),4000);return;}const draft={seller:username,name:String(f.get("name")||""),category:String(f.get("category")||""),price:String(f.get("price")||""),condition:String(f.get("condition")||""),description:String(f.get("description")||""),details};const validated=validateListing(draft);if("error" in validated){setToast(validated.error);setTimeout(()=>setToast(""),4000);return;}const listing={...validated.value,status:"Available" as const,image:photos[validated.value.category],specs:{Details:details||"Seller has not added specifications."},missing:details?[]:["Key specifications"]};if(!details&&!window.confirm("Are you sure you want to proceed? You are missing key specifications that buyers may be looking for."))return;try{const saved=await saveListing(listing);setItems(old=>[{...saved,id:saved.id+1000000},...old]);setSelling(false);setToast("Your product is now listed. Good luck!");}catch(error){setToast(error instanceof Error?error.message:"Could not save listing.");}setTimeout(()=>setToast(""),4000);}
  const navigation=<nav><div className="nav-left"><NavMenu session={session} unread={unread} onSignIn={()=>setAuth(true)} onMessages={()=>setInbox(true)} onSettings={()=>setSettings(true)} onLogout={async()=>{setChat(null);setInbox(false);setSettings(false);await clearLocalKeys();forgetConversationKeys();await signOut();setToast("You have been logged out.");}}/><a className="brand" href="#top">GEAR<span>DROP</span></a></div><div><a href="#browse">Browse</a><a href="#nyx">Ask Nyx</a>{admin&&<span className="admin-badge">Admin</span>}<button className="theme-toggle" onClick={()=>setTheme(theme==="light"?"dark":"light")} aria-label="Toggle colour theme">{theme==="light"?"☾":"☀"}</button><button className="sell" onClick={()=>session?setSelling(true):setAuth(true)}>+ Sell gear</button></div></nav>;
  async function messageSeller(item:Listing){if(!session){setSelected(null);setAuth(true);return;}if(!item.databaseId)return;try{const conv=await openConversation(item.databaseId);setSelected(null);setChat(conv);}catch(error){setToast(error instanceof Error?error.message:"Could not start this conversation.");setTimeout(()=>setToast(""),4000);}}
  const chatModals=session&&<>{inbox&&<Inbox session={session} close={()=>setInbox(false)} open={conv=>{setInbox(false);setChat(conv);}}/>}{chat&&<ChatWindow key={chat.id} session={session} conv={chat} close={()=>setChat(null)} onRead={refreshUnread}/>}{settings&&<Settings session={session} admin={admin} close={()=>setSettings(false)}/>}</>;
  if(page==="safety")return <main>{navigation}<SafetyPage/>{selling&&<Sell username={username} close={()=>setSelling(false)} submit={submit}/>}{auth&&<Auth close={()=>setAuth(false)} complete={setSession}/>}{chatModals}{toast&&<div className="toast">{toast}</div>}</main>;
  return <main>
    {navigation}
    <section className="stack hero" id="top"><i className="stack-dim" aria-hidden="true"/><div className="orbs" aria-hidden="true"><i/><i/><i/></div><div className="hero-strips" aria-hidden="true">{["photo-1527814050087-3793815479db","photo-1587829741301-dc798b83add3","photo-1599669454699-248893623440","photo-1590602847861-f357a9332bbc","photo-1546435770-a3e426bf472b","photo-1615663245857-ac93bb7c39e7","photo-1505740420928-5e560c06d30e"].map(id=><img key={id} src={`https://images.unsplash.com/${id}?auto=format&fit=crop&w=300&q=60`} alt=""/>)}</div><div><p className="eyebrow">SECOND-HAND. FIRST-CLASS.</p><h1>Your next <i>loadout</i><br/>is already here.</h1><p>Pre-loved gaming gear, matched to the way you play.</p><a className="cta" href="#browse">Explore the drop ↓</a></div><div className="hero-gallery"><figure><img src={safeImageUrl(starterListings[1].image)} onError={onImgError} alt="Gaming keyboard"/><span className="price-tag">${starterListings[1].price}</span></figure><figure><img src={safeImageUrl(starterListings[0].image)} onError={onImgError} alt="Gaming mouse"/><span className="price-tag">${starterListings[0].price}</span></figure><figure><img src={safeImageUrl(starterListings[4].image)} onError={onImgError} alt="Gaming laptop"/><span className="price-tag">${starterListings[4].price}</span></figure></div></section>
    <section className="stack categories-section"><i className="stack-dim" aria-hidden="true"/><p className="eyebrow">SHOP BY SETUP</p><h2>What are you hunting for?</h2><div className="categories">{categories.map(c=><button className={category===c.name?"active":""} onClick={()=>{setCategory(c.name);scrollToSection(document.querySelector("#browse"));}} key={c.name}><b>{c.icon}</b><span>{c.name}</span><small>{c.hint}</small></button>)}</div></section>
    <section className="stack nyx" id="nyx"><i className="stack-dim" aria-hidden="true"/><div className="orbs" aria-hidden="true"><i/><i/><i/></div><div><p className="eyebrow">MEET NYX ✦</p><h2>Ask about a setup,<br/>not just a listing.</h2><p>Nyx is GearDrop’s AI assistant. It searches the real listings on GearDrop, knows its way around PCs, laptops, keyboards, mice, mics and headsets, and explains things in plain gamer language.</p><button className="nyx-wave" onClick={()=>{setNyxDraft("Hi Nyx! What can you help me with?");setNyxHi(true);}}>Say hi to Nyx ✦</button></div><div className="nyx-panel"><NyxMascot greet={nyxHi}/><NyxThread session={session} items={items} onOpen={setSelected} requestSignIn={()=>setAuth(true)} label="Ask Nyx anything" placeholder="I have $2000 for a gaming PC, what can I get on GearDrop?" saveable draft={nyxDraft} onDraftUsed={()=>setNyxDraft("")}/><button className="example" onClick={()=>setNyxDraft("Lightweight wireless mouse under $80 for FPS, what do you recommend?")}>Try an example</button></div></section>
    <section className="stack browse" id="browse"><i className="stack-dim" aria-hidden="true"/><div className="section-title"><div><p className="eyebrow">FRESH DROPS</p><h2>Browse the marketplace</h2></div><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search gear..."/></div><div className="filters"><button className={category==="All"?"active":""} onClick={()=>setCategory("All")}>All gear</button>{categories.map(c=><button className={category===c.name?"active":""} onClick={()=>setCategory(c.name)} key={c.name}>{c.name}</button>)}</div><div className="listing-grid">{listingsLoading?Array.from({length:8}).map((_,i)=><div className="card-skeleton" key={i} aria-hidden="true"/>):shown.length===0?<div className="empty">✦ Nyx couldn't find gear matching {search?`"${search}"`:"that filter"}{category!=="All"?` in ${category}`:""}. Try a different search or category.</div>:shown.map(item=><Card item={item} rating={item.ownerId?ratings[item.ownerId]?.asSeller:undefined} onOpen={setSelected} key={item.id}/>)}</div></section>
    <section className="stack compare-section"><i className="stack-dim" aria-hidden="true"/><p className="eyebrow">MODEL MATCHUP</p><h2>Want to compare models?</h2><p>Choose a listing, then click <b>Compare models</b> on that listing to select another model in the same category.</p>{compare.length===0&&<div className="compare-empty">No models selected yet.</div>}{compare.length===1&&<div className="compare-empty">{compare[0].name} selected. Open another {compare[0].category} listing and click Compare models.</div>}{compare.length===2&&<div className="compare-workspace"><div className="compare-table"><div className="compare-head"></div>{compare.map(item=><div className="compare-head" key={item.id}><img src={safeImageUrl(item.image)} onError={onImgError} alt=""/><b>{item.name}</b><span>${item.price}</span></div>)}{["Condition","Availability","Specifications","Missing information"].map(label=><div className="compare-row" key={label}><b>{label}</b>{compare.map(item=><div key={item.id}>{label==="Condition"?item.condition:label==="Availability"?item.status:label==="Specifications"?Object.entries(item.specs).map(([k,v])=><small key={k}>{k}: {v}</small>):item.missing.length?item.missing.join(", "):"No key details missing"}</div>)}</div>)}</div><aside className="compare-nyx"><NyxThread heading={<><h3>Ask Nyx about these models</h3><p>Nyx uses both listings’ details plus its own gear knowledge.</p></>} key={compare.map(x=>x.id).join("-")} session={session} items={items} onOpen={setSelected} requestSignIn={()=>setAuth(true)} mode="compare" focusIds={compare.map(x=>x.id)} label="Your question" placeholder="Which is better for FPS?"/><button className="btn ghost" onClick={()=>setCompare([])}>Clear comparison</button></aside></div>}</section>
    {selected&&<Detail item={selected} close={()=>setSelected(null)} compare={compare} canDelete={Boolean(session&&selected.databaseId&&(admin||selected.ownerId===session.user.id))} own={Boolean(session&&selected.ownerId===session.user.id)} message={()=>messageSeller(selected)} rating={selected.ownerId?ratings[selected.ownerId]?.asSeller:undefined} admin={admin} viewerId={session?.user.id} onReviewsChange={refreshRatings} session={session} items={items} open={setSelected} requestSignIn={()=>{setSelected(null);setAuth(true);}} requestDelete={()=>setDeleteCandidate(selected)} choose={(item)=>{setCompare(old=>old.length===0?[item]:old.some(x=>x.id===item.id)?old:old[0].category===item.category?[old[0],item]:[item]);setSelected(null);scrollToSection(document.querySelector(".compare-section"));}}/>} {deleteCandidate&&<DeleteConfirm cancel={()=>setDeleteCandidate(null)} confirm={async()=>{if(!session||!deleteCandidate.databaseId)return;try{await deleteListing(deleteCandidate.databaseId);setItems(old=>old.filter(item=>item.id!==deleteCandidate.id));setSelected(null);setDeleteCandidate(null);setToast("Listing is now removed.");}catch(error){setDeleteCandidate(null);setToast(error instanceof Error?error.message:"Could not remove listing.");}setTimeout(()=>setToast(""),4000);}}/>} {selling&&<Sell username={username} close={()=>setSelling(false)} submit={submit}/>} {auth&&<Auth close={()=>setAuth(false)} complete={setSession}/>} {chatModals} {toast&&<div className="toast">{toast}</div>}
  </main>;
}

function onImgError(e:SyntheticEvent<HTMLImageElement>){e.currentTarget.onerror=null;e.currentTarget.src="/placeholder-product.svg";}
function statusVariant(status:Listing["status"]){return status==="Available"?"ok":status==="Reserved"?"warn":"bad";}
function Card({item,onOpen,rating}:{item:Listing;onOpen:(item:Listing)=>void;rating?:Rating["asSeller"]}){const open=()=>onOpen(item);return <div className="card" tabIndex={0} role="button" aria-label={`View ${item.name}, $${item.price}, ${item.condition}, ${item.status}`} onClick={open} onKeyDown={e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();open();}}}><div className="product-art"><img src={safeImageUrl(item.image)} onError={onImgError} alt={item.name}/><span className={`tag-badge ${statusVariant(item.status)}`}>{item.status}</span></div><div><small>{item.category}</small><h3>{item.name}</h3><p><b>{item.price}</b> <em>· {item.condition}</em></p><small>Listed {item.posted}</small>{rating&&rating.count>0&&<small className="card-rating" aria-label={`Seller rated ${rating.avg.toFixed(1)} out of 5 from ${rating.count} reviews`}>★ {rating.avg.toFixed(1)} ({rating.count})</small>}</div></div>;}
function Detail({item,close,compare,choose,canDelete,requestDelete,own,message,rating,admin,viewerId,onReviewsChange,session,items,open,requestSignIn}:{item:Listing;close:()=>void;compare:Listing[];choose:(item:Listing)=>void;canDelete:boolean;requestDelete:()=>void;own:boolean;message:()=>void;rating?:Rating["asSeller"];admin:boolean;viewerId?:string;onReviewsChange:()=>void;session:Session|null;items:Listing[];open:(l:Listing)=>void;requestSignIn:()=>void}){const[showReviews,setShowReviews]=useState(false);const wrongCategory=compare.length===1&&compare[0].category!==item.category;const ref=useRef<HTMLDivElement>(null);useModalA11y(ref,close);return <div className="overlay" onMouseDown={overlayClick(close)}><div className="detail" ref={ref} role="dialog" aria-modal="true" aria-label={item.name}><button className="close" onClick={close} aria-label="Close">×</button><img src={safeImageUrl(item.image)} onError={onImgError} alt={item.name}/><div><p className="eyebrow">{item.category} · {item.status}</p><h2>{item.name}</h2><p className="price">$ {item.price}</p>{item.ownerId&&<div className="seller-rating"><button className="example" aria-expanded={showReviews} onClick={()=>setShowReviews(!showReviews)}>Sold by {item.seller} · <RatingBadge rating={rating}/></button>{showReviews&&<ReviewList userId={item.ownerId} role="seller" viewerId={viewerId} admin={admin} onChange={onReviewsChange}/>}</div>}<p>{item.description}</p><div className="specs">{Object.entries(item.specs).map(([key,value])=><div key={key}><small>{key}</small><b>{value}</b></div>)}</div>{item.missing.length>0&&<div className="missing"><b>Nyx noticed missing information</b><p>Ask the seller about: {item.missing.join(", ")}.</p></div>}<div className="ask-product"><NyxThread heading={<b>Ask Nyx about this listing</b>} key={item.id} session={session} items={items} onOpen={open} requestSignIn={requestSignIn} mode="listing" focusIds={[item.id]} label="Your question" placeholder="Is this good for competitive gaming?"/></div><button className="btn primary" disabled={!item.databaseId||own} onClick={message}>{!item.databaseId?"Demo listing — no real seller":own?"This is your listing":`Message ${item.seller}`}</button><button className="btn secondary compare-button" disabled={wrongCategory} onClick={()=>choose(item)}>{wrongCategory?`Choose another ${compare[0].category} model`:`Compare models${compare.length===1?" with selected model":""}`}</button>{canDelete&&<button className="btn destructive" onClick={requestDelete}>Delete listing</button>}</div></div></div>;}
function DeleteConfirm({cancel,confirm}:{cancel:()=>void;confirm:()=>void}){const ref=useRef<HTMLElement>(null);useModalA11y(ref,cancel);return <div className="overlay" onMouseDown={overlayClick(cancel)}><section className="delete-confirm" ref={ref} role="dialog" aria-modal="true" aria-label="Delete listing confirmation"><h2>Are you sure you want to delete your listing</h2><p>This cannot be undone.</p><div><button className="btn secondary" onClick={cancel}>No</button><button className="btn destructive" onClick={confirm}>Yes</button></div></section></div>}
function Sell({username,close,submit}:{username:string|null;close:()=>void;submit:(e:FormEvent<HTMLFormElement>)=>void}){const ref=useRef<HTMLDivElement>(null);useModalA11y(ref,close);return <div className="overlay" onMouseDown={overlayClick(close)}><div className="sell-form" ref={ref} role="dialog" aria-modal="true" aria-label="Create a listing"><form onSubmit={submit}><button type="button" className="close" onClick={close} aria-label="Close">×</button><p className="eyebrow">CREATE A LISTING</p><h2>Drop your gear</h2><p className="muted">It will persist after refresh.</p><p className="muted">Listing as <b>{username??"…"}</b></p><label>Product name<input name="name" required placeholder="e.g. Logitech G305"/></label><label>Category<select name="category">{categories.map(c=><option key={c.name}>{c.name}</option>)}</select></label><div className="form-row"><label>Price (USD)<input name="price" type="number" min="1" required/></label><label>Condition<select name="condition"><option>Like new</option><option>Good</option><option>Fair</option></select></label></div><label>Description<textarea name="description" required placeholder="Condition, accessories and buyer notes."/></label><label>Key specifications<input name="details" placeholder="Wireless, 63 g, original box..."/></label><button className="btn primary submit">Publish listing →</button></form></div></div>;}
// Mirrors this Supabase project's actual Auth password policy (Dashboard >
// Authentication > Policies > Minimum password length), confirmed directly
// against the API — NOT an arbitrary guess. If that setting ever changes,
// update this to match; a mismatch here only costs an extra round trip
// (the real error still surfaces correctly via friendlyAuthError's
// pass-through), it can't silently under- or over-enforce the real rule.
const MIN_PASSWORD_LENGTH=12;

// Returns a local validation error, or "" if the given values are all valid.
// Pulled out of submit() so the same check can run reactively on a poll (see
// below) as well as at submit time.
function localAuthError(mode:"in"|"up",identifier:string,email:string,password:string):string{
  if(mode==="in"&&identifier.length<3)return"Enter your username or email.";
  if(mode==="up"){
    if(identifier.length<3)return"Username must be at least 3 characters.";
    if(email&&!isEmailLike(email))return"Enter a valid email address, or leave it blank.";
    if(password.length<MIN_PASSWORD_LENGTH)return`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return"";
}

function Auth({close,complete}:{close:()=>void;complete:(s:Session)=>void}){
  const[mode,setMode]=useState<"in"|"up">("in");
  const[message,setMessage]=useState("");
  const[submitting,setSubmitting]=useState(false);
  const isLocalError=useRef(false);
  const formRef=useRef<HTMLFormElement>(null);

  // Browser autofill, password-manager extensions, and "suggest a strong
  // password" all set an input's value in ways that don't reliably fire any
  // single JS event React can listen for — onChange misses plain autofill,
  // and even the :-webkit-autofill/animationstart trick only fires once per
  // field, so a second autofill (or a password suggestion filled through a
  // different code path) can leave a stale *local* validation error on
  // screen indefinitely. Rather than chase every possible event, poll the
  // form's actual live values while a local error is showing and clear it
  // the moment it's no longer true — this is correct regardless of *how*
  // the fields changed. Server-side errors (wrong password, already
  // registered, etc.) are deliberately left alone here; they should persist
  // until the next real submit, not be silently cleared by a poll.
  useEffect(()=>{
    if(!message||!isLocalError.current)return;
    const id=setInterval(()=>{
      const form=formRef.current;
      if(!form)return;
      const f=new FormData(form);
      const stillInvalid=localAuthError(mode,String(f.get("identifier")||"").trim(),String(f.get("email")||"").trim(),String(f.get("password")||""));
      if(stillInvalid!==message)setMessage(stillInvalid);
    },250);
    return()=>clearInterval(id);
  },[message,mode]);

  function clear(){if(isLocalError.current&&message)setMessage("");}

  async function submit(e:FormEvent<HTMLFormElement>){
    e.preventDefault();
    const f=new FormData(e.currentTarget);
    const identifier=String(f.get("identifier")||"").trim();
    const email=String(f.get("email")||"").trim();
    const password=String(f.get("password")||"");
    // The form uses noValidate so this runs on every submit attempt (native
    // minLength/required constraints used to block the submit event entirely
    // before our handler ever ran, leaving stale messages on screen with no
    // feedback that the click did nothing).
    const localError=localAuthError(mode,identifier,email,password);
    if(localError){isLocalError.current=true;setMessage(localError);return;}
    isLocalError.current=false;
    setMessage("");
    setSubmitting(true);
    try{
      const session=mode==="in"?await signIn(identifier,password):await signUp(identifier,email,password);
      if(!session)throw new Error("Account created. Please try to log in.");
      // The password is only in hand right now, so this is when the chat key is
      // created or restored. A failure here only leaves chat locked (it asks
      // for the password again later); it must never block signing in.
      await setupChatKeys(session.user.id,password).catch(()=>undefined);
      complete(session);close();
    }catch(error){isLocalError.current=false;setMessage(error instanceof Error?error.message:"Sign-in failed.");}
    finally{setSubmitting(false);}
  }
  const ref=useRef<HTMLDivElement>(null);useModalA11y(ref,close);
  return <div className="overlay" onMouseDown={overlayClick(close)}><div className="sell-form" ref={ref} role="dialog" aria-modal="true" aria-label={mode==="in"?"Sign in":"Create account"}><form ref={formRef} onSubmit={submit} noValidate><button type="button" className="close" onClick={close} aria-label="Close">×</button><p className="eyebrow">NYX ACCOUNT</p><h2>{mode==="in"?"Welcome back":"Create account"}</h2><p className="muted">{mode==="in"?"Sign in with your username or email.":"Pick a username and password. Email is optional."}</p><label>{mode==="in"?"Username or email":"Username"}<input name="identifier" onChange={clear}/></label>{mode==="up"&&<label>Email <span className="optional">(optional)</span><input name="email" type="email" onChange={clear}/><small className="field-hint">Without an email you can’t recover your account if you forget your password. You can add one later in Settings.</small></label>}<label>Password<input name="password" type="password" onChange={clear}/></label>{message&&<p className="field-error" role="alert">{message}</p>}<button className="btn primary submit" disabled={submitting}>{submitting?"Please wait…":mode==="in"?"Sign in":"Create account"}</button><button type="button" className="example" onClick={()=>{setMode(mode==="in"?"up":"in");isLocalError.current=false;setMessage("");}}>{mode==="in"?"Need an account? Sign up":"Already have an account? Sign in"}</button></form></div></div>;}
installRipple(); installStack();
createRoot(document.getElementById("root")!).render(<App/>);
