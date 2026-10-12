export const PRODUCTION_HOST = 'vtulwvjjvgbrgxqzeemi.supabase.co';
export function assertStagingTarget(env) {
  if (env.GEARDROP_STAGING_TESTS !== '1') throw new Error('Live tests require GEARDROP_STAGING_TESTS=1 and a dedicated staging Supabase project.');
  const url = env.VITE_SUPABASE_URL;
  const key = env.VITE_SUPABASE_ANON_KEY;
  const expected = env.GEARDROP_STAGING_HOST;
  if (!url || !key || !expected) throw new Error('Set VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and GEARDROP_STAGING_HOST for staging tests.');
  const target = new URL(url);
  if (target.protocol !== 'https:' || target.hostname === PRODUCTION_HOST || target.hostname !== expected) throw new Error('Refusing live tests: use HTTPS and a staging host that exactly matches GEARDROP_STAGING_HOST, separate from production.');
  if (key.startsWith('sb_secret_')) throw new Error('Tests require a publishable/anon key, never a secret key.');
  if (key.split('.').length===3) {
    let role;
    try { role=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role; } catch { throw new Error('Invalid anon key.'); }
    if (role!=='anon') throw new Error('Tests require an anon key, never a service-role key.');
  }
}
