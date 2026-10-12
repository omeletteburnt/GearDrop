import { spawnSync } from 'node:child_process';
import { assertStagingTarget } from './test-target.mjs';
const mode=process.argv[2]??'all';
if (!['all','unit','browser','staging'].includes(mode)) throw new Error('Unknown test mode.');
if(mode==='staging')assertStagingTarget(process.env);
else delete process.env.GEARDROP_STAGING_TESTS;
const run=(entry,args)=>{const r=spawnSync(process.execPath,[entry,...args],{stdio:'inherit',env:process.env});if(r.status!==0)process.exit(r.status??1);};
if(mode!=='browser')run('node_modules/vitest/vitest.mjs',['run',...(mode==='staging'?['--config','vitest.staging.config.ts']:[])]);
if(mode!=='unit')run('node_modules/@playwright/test/cli.js',['test',...(mode==='staging'?['--config','playwright.staging.config.ts']:[]),...process.argv.slice(3)]);
