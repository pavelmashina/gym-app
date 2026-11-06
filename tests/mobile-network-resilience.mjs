import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {NETWORK_FAILURE_HINT,isNetworkError,isReachable,restoreSession} from '../src/lib/requestResilience.js';

const read=(file)=>fs.readFileSync(file,'utf8');
const realWarn=console.warn;
const realError=console.error;
console.warn=()=>{};
console.error=()=>{};

const session={access_token:'token',user:{id:'user-1'}};
const retryable=Object.assign(new Error('Failed to fetch'),{name:'AuthRetryableFetchError',status:0});
const gatewayDown=Object.assign(new Error('Bad gateway'),{name:'AuthRetryableFetchError',status:502});

// --- A connection failure during session restore is not a sign-out ---
assert.deepEqual(await restoreSession(Promise.resolve({data:{session},error:null})),{session,unreachable:false});
assert.deepEqual(await restoreSession(Promise.resolve({data:{session:null},error:null})),{session:null,unreachable:false},'No stored session means the login screen');
assert.deepEqual(await restoreSession(Promise.resolve({data:{session:null},error:retryable})),{session:null,unreachable:true},'Token refresh lost to the network');
assert.deepEqual(await restoreSession(Promise.resolve({data:{session:null},error:gatewayDown})),{session:null,unreachable:true},'Auth server temporarily down');
assert.deepEqual(await restoreSession(Promise.resolve({data:{session:null},error:Object.assign(new Error('Invalid Refresh Token'),{name:'AuthApiError',code:'refresh_token_not_found'})})),{session:null,unreachable:false},'A rejected token really ends the session');
assert.deepEqual(await restoreSession(new Promise(()=>{}),5),{session:null,unreachable:true},'Startup never waits forever');
assert.deepEqual(await restoreSession(Promise.reject(new TypeError('boom'))),{session:null,unreachable:true},'An unexpected failure leaves a way to retry');

assert.equal(isNetworkError(retryable),true);
assert.equal(isNetworkError(gatewayDown),true);
assert.equal(isNetworkError({name:'AuthApiError',code:'invalid_credentials',message:'Invalid login credentials'}),false);

// --- The server check before a reload ends and tells outage from any answer ---
assert.equal(await isReachable('https://project.supabase.co/auth/v1/health',async()=>new Response(null,{status:401})),true,'An error status still proves the server is reachable');
assert.equal(await isReachable('https://project.supabase.co/auth/v1/health',async()=>{throw new TypeError('Failed to fetch');}),false);
{
  const hang=(_input,init)=>new Promise((_,reject)=>{init.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')));});
  assert.equal(await isReachable('https://project.supabase.co/auth/v1/health',hang,5),false,'A connection that hangs counts as unreachable');
}
{
  let received;
  await isReachable('https://project.supabase.co/auth/v1/health',async(_input,init)=>{received=init;return new Response(null,{status:200});});
  assert.equal(received.mode,'no-cors','The check must not depend on CORS');
  assert.equal(received.cache,'no-store','A cached answer proves nothing about the network');
}

// --- Nothing from another host can hold the app back from starting ---
const cssFiles=(directory)=>fs.readdirSync(directory,{withFileTypes:true}).flatMap((entry)=>{
  const full=path.join(directory,entry.name);
  return entry.isDirectory()?cssFiles(full):entry.name.endsWith('.css')?[full]:[];
});
for (const file of cssFiles('src'))
  assert.doesNotMatch(read(file),/@import\s+(url\()?['"]?https?:/,`${file}: a remote @import blocks the stylesheet and the bundle behind it`);

const html=read('index.html');
const fontLink=html.match(/<link[^>]*fonts\.googleapis\.com[^>]*>/)?.[0];
assert.ok(fontLink,'The app font is still requested');
assert.match(fontLink,/media="print"/);
assert.match(fontLink,/onload="this\.media='all'"/);
for (const tag of html.match(/<(script|link)\b[^>]*(src|href)="https?:[^"]*"[^>]*>/g)??[])
  assert.match(tag,/media="print"|\basync\b|\bdefer\b/,`Blocking remote resource: ${tag}`);

// --- A bundle that never starts leaves an explanation and a way to retry ---
const root=html.match(/<div id="root">([\s\S]*?)<\/div>/)?.[1]??'';
assert.match(root,/id="boot-error"[^>]*\bhidden\b/,'The message waits inside #root, which React clears on mount');
assert.match(root,/location\.reload\(\)/);
assert.ok(html.indexOf('showBootError')<html.indexOf('</head>'),'The watcher runs before the bundle tags appended to head');
assert.doesNotMatch(html.slice(0,html.indexOf('showBootError')),/<(script|link)[^>]*(\/src\/|\/assets\/index)/);

// --- Screens tell a lost connection apart ---
const app=read('src/App.jsx');
const auth=read('src/components/AuthScreen.jsx');
assert.match(app,/restoreSession\(supabase\.auth\.getSession\(\)\)/);
assert.match(app,/event === 'INITIAL_SESSION' && !nextSession/,'The empty initial event of a failed refresh must not reset the app');
assert.match(app,/if \(sessionUnreachable\) return <ConnectionErrorScreen/);
assert.match(app,/addEventListener\('online', retrySessionRestore\)/);
assert.match(app,/isSupabaseReachable\(\)\) \{ window\.location\.reload\(\)/);
assert.match(auth,/isNetworkError\(error\)[\s\S]*?NETWORK_FAILURE_HINT/,'The login form shows no raw "Failed to fetch"');
assert.match(NETWORK_FAILURE_HINT,/Проверьте интернет/);
assert.match(read('src/components/HomeScreen.jsx'),/addEventListener\('online', refresh\)/);

console.warn=realWarn;
console.error=realError;
console.log('Mobile network resilience contracts passed.');
