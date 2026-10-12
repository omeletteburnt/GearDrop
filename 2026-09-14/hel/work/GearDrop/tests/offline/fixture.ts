import { test as base, type Page } from "@playwright/test";
import { png } from "../e2e/png";
export { expect } from "@playwright/test";
// Every API response is in-memory. Unexpected requests fail closed.
// In staging mode the original critical-flow tests use their actual staging API.
export async function mockMarketplace(page:Page, signedIn=false, initialBackup:unknown=null) {
  const userId="10000000-0000-4000-8000-000000000001";
  const otherId="20000000-0000-4000-8000-000000000002";
  let email="seller@example.com",username="seller";
  const profiles:Record<string,{id:string;username:string;created_at:string}>={
    [userId]:{id:userId,username,created_at:"2026-01-01T00:00:00Z"},[otherId]:{id:otherId,username:"other",created_at:"2026-02-01T00:00:00Z"},
  };
  const token=()=>`${btoa(JSON.stringify({alg:"none"}))}.${btoa(JSON.stringify({sub:userId,role:"authenticated",exp:Math.floor(Date.now()/1000)+3600}))}.offline`;
  const user=()=>({id:userId,email,aud:"authenticated",role:"authenticated",created_at:"2026-01-01T00:00:00Z",app_metadata:{},user_metadata:{}});
  const session=()=>({access_token:token(),refresh_token:"offline-refresh",token_type:"bearer",expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:user()});
  if(signedIn)await page.addInitScript(s=>localStorage.setItem("sb-offline-auth-token",JSON.stringify(s)),session());
  const listing=(id:number,owner_id:string,name:string)=>({id,owner_id,name,seller:owner_id===userId?"seller":"other",category:"Mouses",price:50,condition:"Good",status:"Available",image:"https://images.unsplash.com/offline",photos:[],description:"Wireless gaming mouse",specs:{Weight:"60 g",Connection:"Wireless"},missing:[],created_at:"2026-10-01T00:00:00Z"});
  let listings=[listing(501,userId,"Seller's mouse"),listing(502,otherId,"Other seller's mouse")];
  let prefs={persona:"default",platform:""};let favorites:string[]=[];let backup:any=initialBackup;let publicKey:any=null;
  const files=new Map<string,Buffer>();const conversations=[{id:"30000000-0000-4000-8000-000000000003",listing_id:502,buyer_id:userId,seller_id:otherId,last_message_at:null,last_sender_id:null,listing:{name:"Other seller's mouse",price:50,image:"https://images.unsplash.com/offline"},buyer:{username:"seller"},seller:{username:"other"}}];
  await page.route('**/*',async route=>{
    const req=route.request(),url=new URL(req.url());
    if(url.hostname==='localhost'||url.hostname==='127.0.0.1'){await route.continue();return;}
    if(url.hostname!=='offline.supabase.invalid'){
      if(req.resourceType()==='image'){await route.fulfill({contentType:'image/png',body:png('mock.png','8040c0').buffer});return;}
      await route.abort();return;
    }
    const cors={'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-expose-headers':'content-range'};
    if(req.method()==='OPTIONS'){await route.fulfill({status:204,headers:cors});return;}
    const respond=async(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',headers:cors,body:JSON.stringify(body)});
    const body=()=>{try{return req.postDataJSON();}catch{return {};}};
    const one=(data:any[])=>req.headers().accept?.includes('vnd.pgrst.object')?data[0]??null:data;
    if(url.pathname==='/auth/v1/signup'){email=body().email;await respond(session());return;}
    if(url.pathname==='/auth/v1/token'){email=body().email??email;await respond(session());return;}
    if(url.pathname==='/auth/v1/user'){if(req.method()==='PUT'){if(body().password===undefined)email=body().email??email;}await respond(user());return;}
    if(url.pathname==='/auth/v1/logout'){await respond({});return;}
    if(url.pathname==='/auth/v1/recover'){await respond({});return;}
    if(url.pathname==='/rest/v1/profiles'){
      if(req.method()==='POST'){username=body().username;profiles[userId]={id:userId,username,created_at:"2026-01-01T00:00:00Z"};await respond([profiles[userId]]);return;}
      const id=url.searchParams.get('id')?.replace('eq.','');
      const byName=url.searchParams.has('username');await respond(one(byName?[]:id?[profiles[id]].filter(Boolean):Object.values(profiles)));return;
    }
    if(url.pathname==='/rest/v1/listings'){
      const id=Number(url.searchParams.get('id')?.replace('eq.',''));
      if(req.method()==='POST'){const data={...listing(Date.now(),userId,body().name),...body()};listings.unshift(data);await respond(one([data]));return;}
      if(req.method()==='PATCH'){const at=listings.findIndex(x=>x.id===id&&x.owner_id===userId);if(at<0){await respond({message:"Denied"},403);return;}listings[at]={...listings[at],...body()};await respond(one([listings[at]]));return;}
      if(req.method()==='DELETE'){listings=listings.filter(x=>x.id!==id);await route.fulfill({status:204,headers:{...cors,'content-range':'*/1'}});return;}
      await respond(one(id?listings.filter(x=>x.id===id):listings));return;
    }
    if(url.pathname==='/rest/v1/user_preferences'){if(req.method()==='POST')prefs={persona:body().persona,platform:body().platform};await respond(one([prefs]));return;}
    if(url.pathname==='/rest/v1/favorites'){
      if(req.method()==='POST')favorites.push(body().listing_key);
      if(req.method()==='DELETE')favorites=favorites.filter(k=>k!==url.searchParams.get('listing_key')?.replace('eq.',''));
      await respond(favorites.map(listing_key=>({listing_key})));return;
    }
    if(url.pathname==='/rest/v1/key_backups'){if(req.method()==='POST')backup=body();await respond(one(backup?[backup]:[]));return;}
    if(url.pathname==='/rest/v1/public_keys'){if(req.method()==='POST')publicKey=body();await respond(one(publicKey?[publicKey]:[]));return;}
    if(url.pathname==='/rest/v1/conversations'){await respond(conversations);return;}
    if(url.pathname==='/rest/v1/messages'||url.pathname==='/rest/v1/conversation_reads'||url.pathname==='/rest/v1/held_messages'||url.pathname==='/rest/v1/blocks'){await respond([]);return;}
    if(url.pathname.startsWith('/rest/v1/rpc/')){
      const rpc=url.pathname.split('/').at(-1);
      if(rpc==='email_for_username'){await respond(email);return;}
      if(rpc==='is_admin'){await respond(false);return;}
      if(rpc==='nyx_remaining'){await respond(15);return;}
      if(rpc==='rating_summary'){await respond([]);return;}
      if(rpc==='reviews_for'){await respond([]);return;}
    }
    if(url.pathname.startsWith('/functions/v1/nyx')){await respond({answer:"Here are options for your setup.",remaining:14});return;}
    if(url.pathname.startsWith('/storage/v1/object/')){
      const path=url.pathname.replace('/storage/v1/object/public/','').replace('/storage/v1/object/','');
      if(req.method()==='POST'){files.set(path,png('mock.png','8040c0').buffer);await respond({Key:path});return;}
      if(req.method()==='DELETE'){for(const p of body().prefixes??[])files.delete('listing-photos/'+p);await respond([]);return;}
      if(req.method()==='GET'){const file=files.get(path);if(file){await route.fulfill({status:200,headers:cors,contentType:'image/png',body:file});return;}await respond({},404);return;}
    }
    await respond({message:`Unmocked request: ${req.method()} ${url.pathname}`},500);
  });
}
export const test=base.extend({page:async({page},use)=>{if(!process.env.GEARDROP_STAGING_TESTS)await mockMarketplace(page);await use(page);}});
