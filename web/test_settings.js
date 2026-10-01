import assert from 'node:assert/strict';import {handle} from './app.js';
const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
const vals=new Map([['session:'+await hash('sid'),JSON.stringify({user_id:'5',exp:Date.now()+60000})]]);
const DB={prepare(sql){return{bind(...a){return{async first(){return vals.get(a[0])},async run(){vals.set(a[0],a[1])},async all(){return{results:[...vals].filter(([k])=>k.startsWith(a[0].slice(0,-1))).map(([k,value])=>({value}))}}}}}}};
let perm='32',owner='9',offline=false,botPerm='536980496',deny=false;
globalThis.fetch=async url=>{
 if(offline)return new Response('',{status:503});let body;
 if(url.endsWith('/users/@me/guilds'))body=[{id:'1',name:'Test server'}];
 else if(url.endsWith('/users/@me'))body={id:'6'};
 else if(url.endsWith('/members/5'))body={roles:['2']};
 else if(url.endsWith('/members/6'))body={roles:['3']};
 else if(url.endsWith('/roles'))body=[{id:'1',permissions:'0',name:'everyone'},{id:'2',permissions:perm,name:'Manager'},{id:'3',permissions:botPerm,name:'Bot'}];
 else if(url.endsWith('/channels'))body=[{id:'10',name:'test',type:0,permission_overwrites:deny?[{id:'5',type:1,deny:'1024',allow:'0'}]:[]},{id:'11',name:'forum',type:15,permission_overwrites:[]}];
 else body={id:'1',owner_id:owner,name:'Test server'};
 return new Response(JSON.stringify(body));
};
const env={DB,DISCORD_TOKEN:'dummy',BRIDGE_TOKEN:'bridge'};
const get=(p,cookie='album_session=sid')=>handle(new Request('https://album.example'+p,{headers:{cookie}}),env);
const post=(ids=['10'],origin='https://album.example')=>{const f=new FormData();for(const id of ids)f.append('channels',id);f.set('naming','original');return handle(new Request('https://album.example/settings/1',{method:'POST',headers:{Cookie:'album_session=sid',Origin:origin},body:f}),env)};
assert.match(await (await get('/')).text(),/Connected to Discord/);
assert.match(await (await get('/settings','')).text(),/Sign in/);
assert.equal((await get('/settings/1')).status,200);
perm='1040';assert.equal((await get('/settings/1')).status,403); // Manage Channels is insufficient.
perm='8';assert.equal((await get('/settings/1')).status,200);
perm='0';owner='5';assert.equal((await get('/settings/1')).status,200);
owner='9';perm='1056';assert.equal((await post()).status,302);assert.equal(JSON.parse(vals.get('config:1')).replace_messages,false);
assert.equal((await post(['11'])).status,400);assert.equal((await post(['99'])).status,400);assert.equal((await post(['10'],'https://evil.example')).status,403);
deny=true;assert.equal((await post()).status,400);deny=false;botPerm='1024';assert.equal((await post()).status,400);botPerm='536980496';
perm='0';assert.equal((await post()).status,403);offline=true;assert.equal((await get('/settings/1')).status,503);offline=false;
const internal=await handle(new Request('https://album.example/internal/config',{headers:{Authorization:'Bearer bridge'}}),env);assert.equal(internal.status,200);assert.equal((await internal.json()).servers[0].guild_id,'1');
assert.equal((await get('/internal/config')).status,404);
console.log('Settings owner/Admin/Manage Server gate, revocation, fail-closed, CSRF, channel/bot validation and safe config tests passed');

const {writeFile}=await import('node:fs/promises');perm='1056';botPerm='536980496';await writeFile('/tmp/album-settings-preview.html',await (await get('/settings/1')).text());await writeFile('/tmp/album-home-preview.html',await (await get('/')).text());

assert.equal((await get('/settings/1')).headers.get('Referrer-Policy'),'same-origin');assert.equal((await post(['10'],'null')).status,403);
perm='1056';const f=new FormData();f.set('action','reindex');f.set('channel','10');const jr=await handle(new Request('https://album.example/settings/1',{method:'POST',headers:{Cookie:'album_session=sid',Origin:'https://album.example'},body:f}),env);assert.equal(jr.status,302);const job=JSON.parse([...vals].find(([k])=>k.startsWith('reindex:'))[1]);assert.equal(job.status,'queued');assert.equal(job.requested_by,'5');
const jobs=await handle(new Request('https://album.example/internal/reindex',{headers:{Authorization:'Bearer bridge'}}),env);assert.equal((await jobs.json()).length,1);perm='0';await handle(new Request('https://album.example/internal/reindex',{headers:{Authorization:'Bearer bridge'}}),env);assert.equal(JSON.parse(vals.get('reindex:'+job.id)).status,'cancelled');
// Linked source photos require authenticated source-channel visibility even with a capability URL.
const protectedId='d'.repeat(32);vals.set('photo:'+protectedId,JSON.stringify({id:protectedId,channel_id:'10',protected_source_channel_id:'11'}));assert.equal((await get('/photo/'+protectedId+'?token=anything','')).status,404);
console.log('Manual trigger queue, permission revocation and protected source photo tests passed');

perm='1056';await writeFile('/tmp/album-manual-preview.html',await (await get('/settings/1')).text());
