// @ts-ignore Shared runtime guard: direct test invocations must also be staging-only.
import { assertStagingTarget } from "../../tools/test-target.mjs";
assertStagingTarget(process.env);
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { removeTestPhotos, testPhoto } from "../livePhoto";

const url=process.env.VITE_SUPABASE_URL!,key=process.env.VITE_SUPABASE_ANON_KEY!;
const suffix=Date.now();
describe("private preferences, favourites and owner-only listing edits (staging)",()=>{
  let a:SupabaseClient,b:SupabaseClient,owner:string,other:string,id:number,photo:string;
  beforeAll(async()=>{
    async function account(tag:string){const db=createClient(url,key,{auth:{persistSession:false}});const {data,error}=await db.auth.signUp({email:`prefs_${tag}_${suffix}@nyx.local`,password:"TempPass123!"});if(error||!data.session)throw error??new Error("No staging session");const user=data.session.user.id;const p=await db.from("profiles").upsert({id:user,username:`prefs_${tag}_${suffix}`.slice(0,24)});if(p.error)throw p.error;return {db,user};}
    const first=await account('a'),second=await account('b');a=first.db;owner=first.user;b=second.db;other=second.user;
    photo=await testPhoto(a,owner);const result=await a.from("listings").insert({owner_id:owner,name:"Preferences edit test",category:"Mouses",price:50,condition:"Good",image:photo,photos:[photo],description:"Staging test listing",seller:"x"}).select().single();if(result.error)throw result.error;id=result.data.id;
  },30000);
  afterAll(async()=>{if(a&&id)await a.from('listings').delete().eq('id',id);if(a&&photo)await removeTestPhotos(a,[photo]);if(a&&owner)await a.from('favorites').delete().eq('user_id',owner);});
  it("does not expose or allow another user to alter private preferences",async()=>{
    expect((await a.from('user_preferences').upsert({user_id:owner,persona:'competitive',platform:'pc'})).error).toBeNull();
    const anon=createClient(url,key,{auth:{persistSession:false}});const anonymous=await anon.from('user_preferences').select('*');expect(anonymous.error!==null||anonymous.data?.length===0).toBe(true);
    expect((await b.from('user_preferences').select('*').eq('user_id',owner)).data).toEqual([]);
    await b.from('user_preferences').update({persona:'budget'}).eq('user_id',owner);
    expect((await a.from('user_preferences').select('persona').eq('user_id',owner).single()).data?.persona).toBe('competitive');
    expect((await b.from('user_preferences').insert({user_id:owner,persona:'creator'})).error).not.toBeNull();
  });
  it("does not expose or allow cross-user favourite writes",async()=>{
    expect((await a.from('favorites').insert({user_id:owner,listing_key:`listing:${id}`})).error).toBeNull();
    expect((await b.from('favorites').select('*').eq('user_id',owner)).data).toEqual([]);
    expect((await b.from('favorites').insert({user_id:owner,listing_key:'demo:1'})).error).not.toBeNull();
    await b.from('favorites').delete().eq('user_id',owner);
    expect((await a.from('favorites').select('*').eq('user_id',owner)).data).toHaveLength(1);
  });
  it("allows seller price/spec/status updates and rejects cross-user changes",async()=>{
    await b.from('listings').update({price:1,status:'Sold'}).eq('id',id);
    expect((await a.from('listings').select('price,status').eq('id',id).single()).data).toMatchObject({price:50,status:'Available'});
    const updated=await a.from('listings').update({price:45,status:'Reserved',specs:{Weight:'55 g'}}).eq('id',id).select().single();expect(updated.error).toBeNull();expect(updated.data).toMatchObject({price:45,status:'Reserved',specs:{Weight:'55 g'},owner_id:owner});
    await a.from('listings').update({owner_id:other}).eq('id',id);expect((await a.from('listings').select('owner_id').eq('id',id).single()).data?.owner_id).toBe(owner);
  });
});
