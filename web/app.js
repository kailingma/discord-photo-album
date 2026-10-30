import {icons} from './icons.js';
import {lightboxScript} from './lightbox-source.js';
import {images} from './assets.js';
// One web/security implementation. Node + Workers supply only DB and blob I/O.
const enc=new TextEncoder(), safeHeaders={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow','X-Content-Type-Options':'nosniff'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const json=(x,status=200)=>new Response(JSON.stringify(x),{status,headers:{...safeHeaders,'Content-Type':'application/json'}});
const random=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
async function hash(s){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('')}
async function one(e,k){return e.DB.prepare('SELECT value FROM album WHERE key=?').bind(k).first('value')}
async function get(e,k){const v=await one(e,k);return v?JSON.parse(v):null}
async function set(e,k,v){await e.DB.prepare('INSERT INTO album(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').bind(k,JSON.stringify(v)).run()}
async function all(e,p){return (await e.DB.prepare('SELECT value FROM album WHERE key LIKE ? ORDER BY key DESC').bind(p+'%').all()).results.map(x=>JSON.parse(x.value))}
const cookie=(r,n)=>r.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(n+'='))?.slice(n.length+1);
function redirect(url,extra={}){return new Response(null,{status:302,headers:{...safeHeaders,Location:url,...extra}})}
function page(title,body,forms=false){return new Response(`<!doctype html><html lang=en><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>${esc(title)}</title><link rel=icon type=image/png href=/favicon.png><style>body{margin:0;background:#17161d;color:#eceaf2;font:15px/1.5 system-ui}header,main{padding:24px}header{border-bottom:1px solid #34313e;display:flex;gap:24px;align-items:center}h1{font-size:22px;margin:0}a{color:#b4a9ef}input[type=checkbox]{appearance:none;-webkit-appearance:none;display:inline-grid;place-content:center;width:20px;height:20px;min-width:20px;padding:0;margin:0 8px 0 0;vertical-align:middle;border:1.5px solid #8f83ab;border-radius:5px;background:#292634;cursor:pointer}input[type=checkbox]:checked{background:#b4a9ef;border-color:#b4a9ef}input[type=checkbox]:checked::after{content:"";width:9px;height:5px;border:solid #211e2a;border-width:0 0 2px 2px;transform:rotate(-45deg) translateY(-1px)}input[type=checkbox]:disabled{opacity:.4;cursor:not-allowed}input,button,select{background:#292634;color:inherit;border:1px solid #615a78;padding:10px;font:inherit;box-sizing:border-box}select{color-scheme:dark;min-height:44px;max-width:100%}select:focus-visible,input:focus-visible,button:focus-visible,a:focus-visible{outline:2px solid #b4a9ef;outline-offset:3px}option{background:#292634;color:#eceaf2}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:16px}article{background:#211e2a;border:1px solid #37313f}article img,article video{width:100%;height:220px;object-fit:cover}article p{padding:0 14px}.detail{max-width:960px;margin:auto}.detail img,.detail video{max-width:100%;max-height:75vh}.action{display:inline-flex;align-items:center;gap:6px;padding:8px 10px;border:1px solid #615a78;background:#292634;text-decoration:none;color:#eceaf2;font:inherit;min-height:40px;box-sizing:border-box}.action svg{width:18px;height:18px}.actionrow{display:flex;flex-wrap:wrap;gap:8px}dialog{color:#eceaf2;background:#17161d;border:1px solid #615a78;padding:16px;max-width:min(1100px,94vw);max-height:94vh;width:calc(100% - 48px)}dialog::backdrop{background:#000b}.modalbar{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:16px}.modalbar .actionrow{align-items:center}.modalstatus{color:#ada5b9}.detail .action{margin-right:8px}.detail video{width:100%}#lightbox .detail img,#lightbox .detail video{max-height:60vh}header{flex-wrap:wrap}header h1{overflow-wrap:break-word;min-width:160px;flex:1}header>a{flex:0 0 40px}header nav{flex:0 0 auto}@media(max-width:600px){header{gap:12px}header h1{flex:1;min-width:calc(100% - 52px)}header nav{flex-basis:calc(100% - 52px);margin-left:52px;overflow-wrap:break-word}}@media(max-width:600px){dialog{padding:12px;width:calc(100% - 32px);max-width:none}.modalbar{flex-wrap:wrap}.action{min-height:44px}}.dim{color:#ada5b9}.server-group{grid-column:span 2}.server-group>h3{font-size:30px}.server-group>.library-top h3{font-size:30px;margin:0}.channel-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}.channel-tiles .library-card{grid-column:auto}.channel-tiles .library-copy h3{font-size:20px}.channel-tiles .mosaic{height:200px}@media(max-width:720px){.server-group{grid-column:auto}.channel-tiles{grid-template-columns:1fr}.channel-tiles .mosaic{height:220px}}.libraries{max-width:1200px;margin:auto}.library-top{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:24px}.library-top h2{font-size:30px;margin:0}.bento{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.library-card{grid-column:span 2;display:block;color:inherit;text-decoration:none;background:#211e2a;border:1px solid #433a59}.library-card:hover{border-color:#b4a9ef}.mosaic{height:260px;display:grid;grid-template-columns:2fr 1fr 1fr;background:#292536;overflow:hidden}.mosaic img{width:100%;height:100%;object-fit:cover}.mosaic .blank{display:flex;align-items:center;justify-content:center;color:#ada5b9}.library-copy{padding:24px}.library-copy h3{font-size:23px;overflow-wrap:anywhere;margin:0 0 10px}.library-count{font-size:42px;line-height:1.2;color:#c9c1ff}.side-card{padding:24px;background:#211e2a;border:1px solid #433a59}.side-card h3{margin:0 0 14px}.side-stack{display:grid;gap:16px;align-content:start}.statline{display:flex;gap:24px;margin:18px 0}.library-action{display:inline-block;border:1px solid #76648e;padding:10px 16px;background:#302940;color:#eceaf2;text-decoration:none}.library-empty{grid-column:span 2;min-height:240px;padding:32px;border:1px solid #433a59;background:#211e2a}.side-card p{color:#ada5b9}@media(max-width:720px){.bento{grid-template-columns:1fr}.library-card,.library-empty{grid-column:auto}.mosaic{height:220px}.library-top{align-items:start;flex-direction:column}.library-top h2{font-size:26px}.statline{gap:18px}}.mention{color:#c9c1ff;background:#35304c;border-radius:3px;padding:1px 4px}.cap{padding:0 14px;margin:1em 0}.cap-detail{font-size:1.5em;font-weight:700;margin:.83em 0}.md-h1{font-size:1.35em;font-weight:700;margin:.3em 0 .1em}.md-h2{font-size:1.15em;font-weight:700;margin:.3em 0 .1em}.md-h3{font-size:1em;font-weight:700;margin:.25em 0 .1em}.md-sub{font-size:.8em;color:#ada5b9}.md-q{margin:.3em 0;padding-left:10px;border-left:3px solid #615a78;color:#d8d4e4}.md-list{margin:.3em 0;padding-left:22px}.md-code{background:#121118;border:1px solid #34313e;border-radius:6px;padding:8px;overflow-x:auto;white-space:pre-wrap;font-size:.88em;margin:.3em 0}.md-inline{background:#121118;border-radius:4px;padding:1px 4px;font-size:.88em}.spoiler{font:inherit;color:transparent;background:#35304c;border:0;border-radius:3px;padding:1px 4px;cursor:pointer}.spoiler[aria-expanded=true]{color:inherit;background:#292634}nav{margin-left:auto}#lightbox [data-content]{transition:height .22s ease;overflow:hidden}#lightbox [data-content]>.detail{transition:opacity .16s ease}#lightbox [data-content] .detail{margin:0}@media(prefers-reduced-motion:reduce){#lightbox [data-content],#lightbox [data-content]>.detail{transition:none}}</style><header><a href=/ aria-label="Gallery home"><img src=/logo.png alt="" width=40 height=40></a><h1>${esc(title)}</h1><nav><a href=/>Libraries</a> · <a href=/settings>Settings</a> · <a href=/auth/login>Discord login</a></nav></header><main>${body}</main><script defer src=/ui.js></script></html>`,{headers:{...safeHeaders,'Referrer-Policy':forms?'same-origin':'no-referrer','Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; img-src 'self' https://cdn.discordapp.com https://media.discordapp.net; media-src 'self' https://cdn.discordapp.com https://media.discordapp.net; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"}})}
async function memberRole(r,e,ch){
 const sid=cookie(r,'album_session');if(!sid)return null;
 const session=await get(e,'session:'+await hash(sid));if(!session||session.exp<Date.now())return null;
 return userRole(e,ch,session.user_id);
}
async function userRole(e,ch,userId){
 // Refresh roles and channel visibility against Discord on every protected request.
 const base='https://discord.com/api/v10';
 const a=await fetch(`${base}/guilds/${ch.guild_id}/members/${userId}`,{headers:{Authorization:`Bot ${e.DISCORD_TOKEN}`}});
 if(!a.ok)return null;const m=await a.json();
 const b=await fetch(`${base}/channels/${ch.id}`,{headers:{Authorization:`Bot ${e.DISCORD_TOKEN}`}});if(!b.ok)return null;
 const channel=await b.json();const c=await fetch(`${base}/guilds/${ch.guild_id}/roles`,{headers:{Authorization:`Bot ${e.DISCORD_TOKEN}`}});if(!c.ok)return null;
 const roles=await c.json(), ids=[String(ch.guild_id),...m.roles];
 let perm=roles.filter(x=>ids.includes(x.id)).reduce((n,x)=>n|BigInt(x.permissions),0n);
 const admin=(perm&8n)!==0n;
 if(!admin){
  const ow=channel.permission_overwrites||[],everyone=ow.find(x=>x.id===String(ch.guild_id));
  if(everyone)perm=(perm&~BigInt(everyone.deny))|BigInt(everyone.allow);
  const group=ow.filter(x=>x.type===0&&m.roles.includes(x.id));
  const deny=group.reduce((n,x)=>n|BigInt(x.deny),0n),allow=group.reduce((n,x)=>n|BigInt(x.allow),0n);perm=(perm&~deny)|allow;
  const own=ow.find(x=>x.type===1&&x.id===userId);if(own)perm=(perm&~BigInt(own.deny))|BigInt(own.allow);
  if((perm&1024n)===0n)return null;
 }
 const policy=ch.policy||{},match=k=>(policy[k]||[]).some(id=>m.roles.includes(id));
 return admin?'admin':match('admin')?'admin':match('moderator')?'moderator':match('viewer')?'viewer':null;
}
async function allowed(r,e,ch){const t=new URL(r.url).searchParams.get('token');return !!(t&&(await hash(t)===ch.token_hash||(await get(e,'share:'+await hash(t)))?.channel_id===ch.id))||!!await memberRole(r,e,ch)}
async function signedIn(r,e){const sid=cookie(r,'album_session');if(!sid)return null;const s=await get(e,'session:'+await hash(sid));return s&&s.exp>Date.now()?s:null}
async function discordRead(e,path){const r=await fetch('https://discord.com/api/v10'+path,{headers:{Authorization:`Bot ${e.DISCORD_TOKEN}`}});if(!r.ok)throw Error('Discord permission check unavailable');return r.json()}
function channelPerm(guild,roles,member,ch,user){
 if(guild.owner_id===user)return -1n;
 let p=roles.filter(x=>[guild.id,...member.roles].includes(x.id)).reduce((n,x)=>n|BigInt(x.permissions),0n);if(p&8n)return -1n;
 const o=ch.permission_overwrites||[],a=o.find(x=>x.type===0&&x.id===guild.id);if(a)p=(p&~BigInt(a.deny))|BigInt(a.allow);
 const g=o.filter(x=>x.type===0&&member.roles.includes(x.id));p=(p&~g.reduce((n,x)=>n|BigInt(x.deny),0n))|g.reduce((n,x)=>n|BigInt(x.allow),0n);
 const own=o.find(x=>x.type===1&&x.id===user);return own?(p&~BigInt(own.deny))|BigInt(own.allow):p;
}
async function serverAccess(r,e,id){
 const s=await signedIn(r,e);if(!s)return null;
 const [guild,member,roles]=await Promise.all([discordRead(e,'/guilds/'+id),discordRead(e,`/guilds/${id}/members/${s.user_id}`),discordRead(e,`/guilds/${id}/roles`)]);
 const p=roles.filter(x=>[id,...member.roles].includes(x.id)).reduce((n,x)=>n|BigInt(x.permissions),0n);
 return guild.owner_id===s.user_id||(p&40n)!==0n?{guild,member,roles,user:s.user_id}:null;
}
function displayAuthor(rec){return /forwarded.*original author unavailable/i.test(rec.author||'')?'Author Unknown':rec.author}
function discordMessageLink(rec){
 if(rec.deleted){
  const repost=String(rec.repost_id||'').split(',')[0];
  if(/^\d+$/.test(String(rec.guild_id))&&/^\d+$/.test(String(rec.channel_id))&&/^\d+$/.test(repost))return {url:`https://discord.com/channels/${rec.guild_id}/${rec.channel_id}/${repost}`,label:'Open message'};
  return null;
 }
 const raw=rec.source_jump_url||rec.jump_url;if(!raw)return null;
 try{const u=new URL(raw);if(u.protocol!=='https:'||!['discord.com','discordapp.com'].includes(u.hostname)||!/^\/channels\/\d+\/\d+\/\d+$/.test(u.pathname)||u.search||u.hash)return null;return {url:u.href,label:rec.source_kind==='forwarded_snapshot'?'Forwarded message':'Original Discord message'}}catch{return null}
}
const videoRecord=rec=>rec.media_kind==='video'||String(rec.content_type||'').startsWith('video/')||/\.(mp4|webm|mov|m4v|ogv|avi|mkv)$/i.test(rec.original||'');
function mediaElement(rec,q='',lazy=false){return videoRecord(rec)?`<video controls playsinline preload=none aria-label="${esc(rec.caption||rec.original)}"><source src="/media/${rec.id}${q}" type="${esc(rec.content_type||'video/mp4')}">Video preview unavailable.</video><p><a href="/media/${rec.id}${q}" download="${esc(rec.original)}">Download original video</a></p>`:linkedImage(rec,`<img ${lazy?'loading=lazy':''} alt="${esc(rec.caption||rec.original)}" src="/media/${rec.id}${q}${lazy?(q?'&':'?')+'preview=1':''}">`)}
function linkedImage(rec,img){return img}
async function guildName(e,id,cache=new Map()){
 if(!cache.has(id))cache.set(id,(async()=>{try{return (await discordRead(e,'/guilds/'+id)).name}catch{return 'Discord server'}})());return cache.get(id);
}
async function cleanupAuthorized(e,job){try{return await reindexAuthorized(e,job)}catch{return false}}
async function photoToken(r,e,rec,ch){const t=new URL(r.url).searchParams.get('token');if(!t)return false;if(ch&&await hash(t)===ch.token_hash)return true;const cap=await get(e,'share:'+await hash(t));return cap?.photo_id===rec.id||cap?.channel_id===ch?.id}
async function discordAttachment(e,rec){
 try{const cid=rec.source_channel_id||rec.channel_id,mid=rec.source_message_id||rec.message_id;
 const message=await discordRead(e,`/channels/${cid}/messages/${mid}`),a=(message.attachments||[]).find(a=>String(a.id)===String(rec.attachment_id));if(!a?.url)return null;
 const u=new URL(a.url);if(u.protocol!=='https:'||!['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname))return null;
 if(rec.attachment_url!==u.href)await set(e,'photo:'+rec.id,{...rec,attachment_url:u.href});
 const response=await fetch(u.href,{method:'HEAD'});return response.ok?u.href:null;
 }catch{return null}
}
async function canShare(r,e,ch){return ch&&await allowed(r,e,ch)}
function shareDialog(){return `<dialog id=share-dialog aria-label="Share media"><div class=modalbar><h2>Share</h2><button class=action data-close-share aria-label="Close share">${icons.x}</button></div><p><label><input type=checkbox name=gallery> Allow access to the entire gallery</label></p><button class=action data-create-share>${icons.link} Show link</button><p><input data-share-link readonly aria-label="Share link" style="width:100%"></p><button class=action data-copy-share>${icons.copy} Copy link</button><p data-share-status role=status></p></dialog>`}
// Discord-style inline styles in a link/mention-free segment. Escape-first; unmatched or ambiguous markers stay literal. Styles never span links, mentions or lines.
function inlineStyles(s,depth){
 if(depth===undefined)depth=0;
 let html='',plain='',i=0;
 const marks=['**','__','~~','||','`','*','_'];
 while(i<s.length){
  let at=-1,mk='';
  for(const m of marks){const p=s.indexOf(m,i);if(p>=0&&(at<0||p<at||(p===at&&m.length>mk.length))){at=p;mk=m}}
  if(at<0){html+=esc(s.slice(i));plain+=s.slice(i);break}
  const open=at+mk.length,next=s[open],lit=()=>{html+=esc(s.slice(i,open));plain+=s.slice(i,open);i=open};
  if(next===undefined||/\s/.test(next)){lit();continue}
  if(mk[0]==='_'&&at>0&&/[\p{L}\p{N}]/u.test(s[at-1])){lit();continue}
  let close=s.indexOf(mk,open);
  while(close>=0&&(close===open||/\s/.test(s[close-1])))close=s.indexOf(mk,close+1);
  if(close<0){lit();continue}
  if(mk[0]==='_'&&close+mk.length<s.length&&/[\p{L}\p{N}]/u.test(s[close+mk.length])){lit();continue}
  const inner=s.slice(open,close);
  if(!inner||inner.includes('\n')||(mk==='`'&&inner.includes('`'))){lit();continue}
  html+=esc(s.slice(i,at));plain+=s.slice(i,at);
  if(mk==='`'){html+=`<code class=md-inline>${esc(inner)}</code>`;plain+=inner}
  else{
   const x=depth<3?inlineStyles(inner,depth+1):{html:esc(inner),plain:inner};
   if(mk==='**')html+='<b>'+x.html+'</b>';
   else if(mk==='__')html+='<u>'+x.html+'</u>';
   else if(mk==='~~')html+='<s>'+x.html+'</s>';
   else if(mk==='||')html+=`<button type=button class=spoiler aria-expanded="false">${x.html}</button>`;
   else html+='<i>'+x.html+'</i>';
   plain+=x.plain;
  }
  i=close+mk.length;
 }
 return {html,plain};
}
// One pass over Discord mentions and Markdown links in a single-line or multi-line text chunk; styles render in the gaps, all other text stays literal and escaped.
async function captionInline(e,guild,cache,text){
 let plain='',html='',last=0;
 const matches=[...text.matchAll(/<(@!?|@&|#)(\d+)>|\[([^\]\n]+)\]\(\s*(?:<([^>\n]+)>|([^)\s]+))\s*\)/g)];
 for(const m of matches){
  const seg=inlineStyles(text.slice(last,m.index));plain+=seg.plain;html+=seg.html;
  if(m[1]===undefined){
   // Markdown link. Reject control/whitespace-bearing or unparseable destinations outright; never strip-to-launder.
   const lt=m[3],candidate=m[4]??m[5]??'';let href=null;
   // <> form may hold spaces (percent-encoded by the parser); bare form may hold none. Control characters are never stripped or tolerated in either.
   const badchars=m[4]?/[\x00-\x1f\x7f]/:/[\x00-\x20\x7f]/;
   if(candidate&&!badchars.test(candidate)){
    try{const u=new URL(candidate);if(['https:','http:','mailto:'].includes(u.protocol))href=u.href}catch{}
   }
   if(href){plain+=lt;html+=`<a href="${esc(href)}" target=_blank rel="noopener noreferrer">${esc(lt)}</a>`}
   else{plain+=m[0];html+=esc(m[0])}
   last=m.index+m[0].length;continue;
  }
  const type=m[1]==='@&'?'role':m[1]==='#'?'channel':'user',id=m[2],key=guild+':'+type+':'+id;
  if(!cache.has(key))cache.set(key,(async()=>{
   try{
    if(!guild||cache.size>50)return null;
    if(type==='user'){const x=await discordRead(e,`/guilds/${guild}/members/${id}`);return x.nick||x.user?.global_name||x.user?.username||null}
    if(type==='role'){const rk=guild+':roles';if(!cache.has(rk))cache.set(rk,discordRead(e,'/guilds/'+guild+'/roles'));return (await cache.get(rk)).find(x=>x.id===id)?.name||null}
    // Channel names can reveal private channels, so do not resolve them here.
    return null;
   }catch{return null}
  })());
  const name=await cache.get(key),label=(type==='channel'?'#':'@')+(name||('unknown '+type));plain+=label;html+=`<span class=mention>${esc(label)}</span>`;last=m.index+m[0].length;
 }
 const seg=inlineStyles(text.slice(last));plain+=seg.plain;html+=seg.html;return {plain,html};
}
export async function captionDisplay(e,rec,cache){
 const raw=rec.caption||rec.original||'',guild=rec.guild_id;
 // Block-level Discord Markdown: fenced code blocks, quotes, lists, headings and subtext split the caption first; the inline pass runs inside each piece. Unclosed fences and unmatched syntax stay literal.
 const L=raw.split('\n'),pairs=new Map();let op=-1;
 L.forEach((ln,idx)=>{if(op<0){if(/^```\w*$/.test(ln))op=idx}else if(/^```$/.test(ln)){pairs.set(op,idx);op=-1}});
 const blocks=[];let block=false,i=0,m;
 while(i<L.length){
  const ln=L[i];
  if(pairs.has(i)){const j=pairs.get(i);blocks.push({t:'code',body:L.slice(i+1,j).join('\n')});block=true;i=j+1;continue}
  if(m=ln.match(/^(#{1,3}) (\S.*)$/)){blocks.push({t:'h'+m[1].length,body:m[2]});block=true;i++;continue}
  if(m=ln.match(/^-# (\S.*)$/)){blocks.push({t:'sub',body:m[1]});block=true;i++;continue}
  if(/^> ?/.test(ln)){const g=[];while(i<L.length&&(m=L[i].match(/^> ?(.*)$/))){g.push(m[1]);i++}blocks.push({t:'quote',body:g});block=true;continue}
  if(/^[-*] \S/.test(ln)){const g=[];while(i<L.length&&(m=L[i].match(/^[-*] (\S.*)$/))){g.push(m[1]);i++}blocks.push({t:'list',body:g});block=true;continue}
  const g=[];while(i<L.length&&!pairs.has(i)&&!/^(#{1,3} \S|-# \S|> ?|- \S|\* \S)/.test(L[i])){g.push(L[i]);i++}
  if(g.length)blocks.push({t:'text',body:g.join('\n')});
 }
 let plain='',html='',firstPlain=true;
 for(const b of blocks){
  if(!firstPlain)plain+='\n';firstPlain=false;
  if(b.t==='code'){plain+=b.body;html+=`<pre class=md-code><code>${esc(b.body)}</code></pre>`}
  else if(b.t==='quote'){const parts=[];for(const q of b.body)parts.push(await captionInline(e,guild,cache,q));plain+=parts.map(x=>x.plain).join('\n');html+=`<blockquote class=md-q>${parts.map(x=>x.html).join('<br>')}</blockquote>`}
  else if(b.t==='list'){const parts=[];for(const q of b.body)parts.push(await captionInline(e,guild,cache,q));plain+=parts.map(x=>'- '+x.plain).join('\n');html+=`<ul class=md-list>${parts.map(x=>'<li>'+x.html+'</li>').join('')}</ul>`}
  else if(b.t==='sub'){const x=await captionInline(e,guild,cache,b.body);plain+=x.plain;html+=`<div class=md-sub>${x.html}</div>`}
  else if(b.t[0]==='h'){const x=await captionInline(e,guild,cache,b.body);plain+=x.plain;html+=`<div class=md-${b.t}>${x.html}</div>`}
  else{const x=await captionInline(e,guild,cache,b.body);plain+=x.plain;html+=x.html.replace(/\n/g,'<br>')}
 }
 return {plain,html,block};
}
async function sourceVisible(r,e,rec){
 if(!rec.protected_source_channel_id)return true;
 const session=await signedIn(r,e);if(!session)return false;
 const ch=await discordRead(e,'/channels/'+rec.protected_source_channel_id);
 const [guild,member,roles]=await Promise.all([discordRead(e,'/guilds/'+ch.guild_id),discordRead(e,`/guilds/${ch.guild_id}/members/${session.user_id}`),discordRead(e,`/guilds/${ch.guild_id}/roles`)]);
 return (channelPerm(guild,roles,member,ch,session.user_id)&1024n)!==0n;
}
async function reindexAuthorized(e,job){
 if(job.photo_id){const rec=await get(e,'photo:'+job.photo_id),ch=await get(e,'channel:'+job.channel_id);return !!(rec&&ch&&rec.channel_id===job.channel_id&&await userRole(e,ch,job.requested_by)==='admin')}

 const [guild,member,roles]=await Promise.all([discordRead(e,'/guilds/'+job.guild_id),discordRead(e,`/guilds/${job.guild_id}/members/${job.requested_by}`),discordRead(e,`/guilds/${job.guild_id}/roles`)]);
 const p=roles.filter(x=>[job.guild_id,...member.roles].includes(x.id)).reduce((n,x)=>n|BigInt(x.permissions),0n);
 return guild.owner_id===job.requested_by||(p&40n)!==0n;
}
async function settings(r,e,u){
 const s=await signedIn(r,e);if(!s)return page('Settings','<p>Sign in with Discord to configure servers.</p><p><a href=/auth/login>Sign in</a></p>');
 const id=u.pathname.split('/')[2];
 if(!id){
  if(r.method!=='GET')return json({error:'method'},405);
  const guilds=await discordRead(e,'/users/@me/guilds'),links=[];let failed=0;
  for(const g of guilds){try{if(await serverAccess(r,e,g.id))links.push(`<p><a href=/settings/${g.id}>${esc(g.name)}</a></p>`)}catch{failed++}}
  return page('Settings',`<p>Signed in with Discord. Only servers where you are owner, Administrator or have Manage Server are shown.</p>${failed?'<p>Some server permissions could not be checked. Try again before changing settings.</p>':''}${links.length?links.join(''):'<p>No configurable servers found. Invite the bot to your server and check your permissions. Discord permission errors fail closed.</p>'}<p><a href=/>Back to libraries</a></p>`,true);
 }
 if(!/^\d+$/.test(id))return json({error:'not found'},404);
 const access=await serverAccess(r,e,id);if(!access)return json({error:'forbidden'},403);
 const channels=(await discordRead(e,`/guilds/${id}/channels`)).filter(x=>x.type===0),me=await discordRead(e,'/users/@me'),bot=await discordRead(e,`/guilds/${id}/members/${me.id}`);
 const eligible=channels.filter(ch=>(channelPerm(access.guild,access.roles,access.member,ch,access.user)&1024n)!==0n);
 let config=await get(e,'config:'+id)||{guild_id:id,channels:[],role_policy:{viewer:[],moderator:[],admin:[]},naming:'original',folder_per_channel:false,max_attachment_bytes:25000000,replace_messages:false};
 if(r.method==='POST'){
  if(r.headers.get('Origin')!==u.origin)return json({error:'origin'},403);
  const f=await r.formData();
  if(f.get('action')==='cleanup'){
   const jobs=await all(e,'cleanup:');if(jobs.some(j=>j.guild_id===id&&['queued','running'].includes(j.status)))return json({error:'Cleanup already queued or running'},409);
   const job={id:random(),guild_id:id,requested_by:s.user_id,status:'queued',cleaned:0,failed:0,created_at:new Date().toISOString()};await set(e,'cleanup:'+job.id,job);return redirect('/settings/'+id+'?cleanup=1');
  }
  if(f.get('action')==='reindex'){
   const cid=String(f.get('channel'));if(!config.channels.includes(cid)||!eligible.some(ch=>ch.id===cid))return json({error:'invalid channel'},400);
   const ch=eligible.find(ch=>ch.id===cid);if((channelPerm(access.guild,access.roles,bot,ch,me.id)&66560n)!==66560n)return json({error:'Bot cannot read channel history'},400);
   const previous=(await all(e,'reindex:')).find(j=>j.channel_id===cid&&['queued','running'].includes(j.status));if(previous)return json({error:'Reindex already queued or running'},409);
   const job={id:random(),guild_id:id,channel_id:cid,requested_by:s.user_id,status:'queued',scanned:0,saved:0,unresolved:0,created_at:new Date().toISOString()};await set(e,'reindex:'+job.id,job);return redirect('/settings/'+id+'?reindex=1');
  }
  const ids=f.getAll('channels').map(String);if(ids.length>100||new Set(ids).size!==ids.length||ids.some(x=>!eligible.some(ch=>ch.id===x)))return json({error:'invalid channels'},400);
  const replacement=f.get('replace_messages')==='on',intro=f.get('introduce_channels')==='on';
  const required=66560n|(replacement?536913920n:0n)|(intro?2064n:0n);
  for(const cid of ids){const ch=eligible.find(x=>x.id===cid);if((channelPerm(access.guild,access.roles,bot,ch,me.id)&required)!==required)return json({error:`Bot lacks required permissions in #${ch.name}`},400)}
  const policy=Object.fromEntries(['viewer','moderator','admin'].map(k=>[k,String(f.get(k)||'').split(',').map(x=>x.trim()).filter(Boolean)]));if(Object.values(policy).some(a=>a.length>100||a.some(x=>!access.roles.some(role=>role.id===x))))return json({error:'invalid role IDs'},400);
  const naming=String(f.get('naming'));if(!['original','caption','sequence','date'].includes(naming))return json({error:'invalid naming'},400);
  config={...config,channels:ids,role_policy:policy,naming,folder_per_channel:f.get('folder_per_channel')==='on',replace_messages:replacement,introduce_channels:intro,compress_previews:f.get('compress_previews')==='on',updated_at:new Date().toISOString()};
  await set(e,'config:'+id,config);
  // Apply policy only to channels in this server, without touching capability tokens.
  for(const ch of await all(e,'channel:'))if(ch.guild_id===id&&ids.includes(ch.id))await set(e,'channel:'+ch.id,{...ch,policy});
  return redirect('/settings/'+id+'?saved=1');
 }
 if(r.method!=='GET')return json({error:'method'},405);
 return page('Settings: '+access.guild.name,`<p>Signed in with Discord. Server permissions checked live.</p>${u.searchParams.has('saved')?'<p role=status>Settings saved. New-message watching uses these settings once the gateway is running. History is reindexed only by the manual button.</p>':''}<form method=post><h2>Watched channels</h2><p>Select text channels. Saving does not post, change channel topics, or start archival. Optional Discord-changing functions remain off unless selected below.</p>${eligible.map(ch=>`<p><label><input type=checkbox name=channels value="${ch.id}" ${config.channels.includes(ch.id)?'checked':''}> #${esc(ch.name)}</label></p>`).join('')||'<p>No visible text channels.</p>'}<h2>Library roles</h2><p>Role IDs, comma separated. Discord Administrators retain library access.</p>${['viewer','moderator','admin'].map(k=>`<p><label>${k}<br><input name=${k} value="${esc(config.role_policy[k].join(','))}"></label></p>`).join('')}<details><summary>Available server roles</summary>${access.roles.map(x=>`<p>${esc(x.name)}: ${x.id}</p>`).join('')}</details><h2>Gateway preferences</h2><label>Filename mode <select name=naming>${['original','caption','sequence','date'].map(x=>`<option ${config.naming===x?'selected':''}>${x}</option>`).join('')}</select></label><p><label><input type=checkbox name=folder_per_channel ${config.folder_per_channel?'checked':''}> Separate folders per channel</label></p><p><label><input type=checkbox name=compress_previews ${config.compress_previews!==false?'checked':''}> Use compressed gallery previews</label></p><p>Previews use sanitized server copies. Full-size archive files remain full quality.</p><fieldset><legend>Discord changes (optional)</legend><p><label><input type=checkbox name=introduce_channels ${config.introduce_channels?'checked':''}> Post the library introduction and add its link to channel topics</label></p><p><label><input type=checkbox name=replace_messages ${config.replace_messages?'checked':''}> Replace NEW photo messages using a webhook, then delete their originals after archive/repost succeeds</label></p><p>These actions change Discord. Leave both unchecked for archive-only watching. Manual reindex never deletes or reposts history.</p></fieldset><p>Storage: private R2. Token and host secrets are not shown here.</p><button>Save settings</button></form><h2>Clean metadata</h2><p>Manually strips identifying metadata from files already in the archive and creates compressed previews. Does not read Discord history, repost or delete Discord messages. Full-resolution pixels/video streams are retained. Unsupported files remain unchanged and are reported.</p><form method=post><input type=hidden name=action value=cleanup><button>Clean metadata</button></form>${(await all(e,'cleanup:')).filter(j=>j.guild_id===id).map(j=>`<p role=status>${esc(j.status)}: ${j.cleaned||0} cleaned, ${j.failed||0} failed. ${esc(j.error||'')}</p>${(j.issues||[]).map(x=>`<p class=dim>File ${esc(x.id)}: ${esc(x.reason)}</p>`).join('')}`).join('')}<h2>Manual reindex</h2><p>Archives existing photos and videos up to 25 MB each, forwarded snapshots and accessible Discord message links. It never deletes or reposts history. Starting the gateway does not reindex history. Larger files remain in Discord and are reported unresolved; no transcoding is done. Private linked originals require access to their source channel.</p>${config.channels.map(cid=>`<form method=post><input type=hidden name=action value=reindex><input type=hidden name=channel value="${cid}"><button>Reindex #${esc(channels.find(ch=>ch.id===cid)?.name||cid)}</button></form>`).join('')}${(await all(e,'reindex:')).filter(j=>j.guild_id===id).slice(0,10).map(j=>`<p role=status>#${esc(channels.find(ch=>ch.id===j.channel_id)?.name||j.channel_id)}: ${esc(j.status)}. Scanned ${j.scanned||0}, archived ${j.saved||0}, unresolved ${j.unresolved||0}. ${esc(j.error||'')}</p>${(j.issues||[]).map(x=>`<p class=dim>Message ${esc(x.message_id)}: ${esc(x.reason)}</p>`).join('')}`).join('')}<p><a href=/settings>Other servers</a> · <a href=/>Libraries</a></p>`,true);
}

export async function handle(r,e){
 try{
 const u=new URL(r.url),p=u.pathname;
 if(p==='/settings'||p.startsWith('/settings/'))return await settings(r,e,u);
 if(p==='/ui.js'&&r.method==='GET')return new Response(lightboxScript,{headers:{...safeHeaders,'Content-Type':'text/javascript; charset=utf-8'}});
 if(['/logo.png','/favicon.png'].includes(p)&&r.method==='GET')return new Response(Uint8Array.from(atob(images[p.slice(1)]),c=>c.charCodeAt(0)),{headers:{...safeHeaders,'Cache-Control':'public, max-age=86400','Content-Type':'image/png'}});
 if(p.startsWith('/setup-release/')&&r.method==='GET'){
  const cap=await get(e,'setup-release:'+await hash(p.split('/').pop()));if(!cap||cap.exp<Date.now())return json({error:'not found'},404);
  const obj=await e.FILES.get(cap.key);if(!obj)return json({error:'not found'},404);
  return new Response(obj.body,{headers:{...safeHeaders,'Content-Type':'application/gzip','Content-Disposition':'attachment; filename="gateway-release.tar.gz"'}});
 }
 if(p.startsWith('/share/')&&r.method==='POST'){
  if(r.headers.get('Origin')!==u.origin)return json({error:'origin'},403);const id=p.split('/').pop(),rec=await get(e,'photo:'+id);if(!rec)return json({error:'not found'},404);const ch=await get(e,'channel:'+rec.channel_id);if(!await sourceVisible(r,e,rec))return json({error:'forbidden'},403);if(!rec.metadata_clean)return json({error:'Run Clean metadata for this file first'},409);
  const body=await r.json(),strip=body.strip===true,gallery=body.gallery===true&&!strip;if(gallery&&!await allowed(r,e,ch))return json({error:'Gallery access required for gallery sharing'},403);let token='';if(!strip){token=random();await set(e,'share:'+await hash(token),{...(gallery?{channel_id:ch.id}:{photo_id:id}),created_at:new Date().toISOString()})}return json({url:e.PUBLIC_URL+'/photo/'+id+(token?'?token='+token:''),gallery});
 }
 if(p==='/robots.txt')return new Response('User-agent: *\nDisallow: /\n',{headers:safeHeaders});
 if(p.startsWith('/internal/')){
  if(!e.BRIDGE_TOKEN||r.headers.get('Authorization')!==`Bearer ${e.BRIDGE_TOKEN}`)return json({error:'not found'},404);
  if(p==='/internal/cleanup'&&r.method==='GET'){
   const jobs=[];for(const j of await all(e,'cleanup:'))if(['queued','running'].includes(j.status)){if(await cleanupAuthorized(e,j))jobs.push(j);else await set(e,'cleanup:'+j.id,{...j,status:'cancelled'})}return json(jobs);
  }
  if(p.startsWith('/internal/cleanup/')){
   const key='cleanup:'+p.split('/').pop(),job=await get(e,key);if(!job)return json({error:'not found'},404);
   if(!await cleanupAuthorized(e,job)){await set(e,key,{...job,status:'cancelled'});return json({status:'cancelled'})}
   if(r.method==='PATCH'){const b=await r.json();await set(e,key,{...job,...Object.fromEntries(Object.entries(b).filter(([k])=>['status','cleaned','failed','issues','done_ids','error'].includes(k))),updated_at:new Date().toISOString()});return json({ok:true})}
   if(r.method==='GET')return json(job);return json({error:'method'},405);
  }
  if(p.startsWith('/internal/records/')&&r.method==='PATCH'){
   const id=p.split('/').pop(),rec=await get(e,'photo:'+id);if(!rec)return json({error:'not found'},404);const b=await r.json();await set(e,'photo:'+id,{...rec,...Object.fromEntries(Object.entries(b).filter(([k])=>['metadata_clean','mime','content_type','size_bytes','capture_date','orientation','has_preview','attachment_url'].includes(k)))});return json({ok:true});
  }
  if((p.startsWith('/internal/media/')||p.startsWith('/internal/preview/'))&&r.method==='GET'){
   const id=p.split('/').pop();if(!/^[a-f0-9]{32}$/.test(id))return json({error:'bad key'},400);const blob=await e.FILES.get('album/'+(p.includes('/preview/')?'preview/':'')+id);return blob?new Response(blob.body,{headers:{...safeHeaders,'Content-Type':blob.httpMetadata?.contentType||'application/octet-stream'}}):json({error:'not found'},404);
  }
  if(p.startsWith('/internal/preview/')&&r.method==='PUT'){
   const id=p.split('/').pop();if(!/^[a-f0-9]{32}$/.test(id))return json({error:'bad key'},400);const data=await r.arrayBuffer();if(data.byteLength>2000000)return json({error:'preview too large'},413);const key='album/preview/'+id,previous=await e.FILES.head(key),usage=await get(e,'quota:archive')||{bytes:0,objects:0};if(usage.bytes+data.byteLength-(previous?.size||0)>Number(e.ARCHIVE_MAX_BYTES||2000000000)||(!previous&&usage.objects>=Number(e.ARCHIVE_MAX_OBJECTS||25000)))return json({error:'archive safety quota reached'},413);await e.FILES.put(key,data,{httpMetadata:{contentType:'image/webp'}});await set(e,'quota:archive',{bytes:Math.max(0,usage.bytes+data.byteLength-(previous?.size||0)),objects:usage.objects+(previous?0:1)});return json({ok:true});
  }
  if(p==='/internal/reindex'&&r.method==='GET'){
   const jobs=[];for(const j of await all(e,'reindex:'))if(['queued','running'].includes(j.status)){if(await reindexAuthorized(e,j))jobs.push(j);else await set(e,'reindex:'+j.id,{...j,status:'cancelled',error:'Requester permission revoked'})}return json(jobs);
  }
  if(p.startsWith('/internal/reindex/')){
   const key='reindex:'+p.split('/').pop(),job=await get(e,key);if(!job)return json({error:'not found'},404);
   if(!await reindexAuthorized(e,job)){await set(e,key,{...job,status:'cancelled',error:'Requester permission revoked'});return json({status:'cancelled'})}
   if(r.method==='PATCH'){const b=await r.json();await set(e,key,{...job,...Object.fromEntries(Object.entries(b).filter(([k])=>['status','cursor','scanned','saved','unresolved','issues','error'].includes(k))),updated_at:new Date().toISOString()});return json({ok:true})}
   if(r.method==='GET')return json(job);return json({error:'method'},405);
  }
  if(p==='/internal/inspect-channel'&&r.method==='POST'){
   const b=await r.json();if(!/^\d+$/.test(String(b.id)))return json({error:'invalid channel'},400);
   const ch=await discordRead(e,'/channels/'+b.id),me=await discordRead(e,'/users/@me');
   const [guild,roles,bot]=await Promise.all([discordRead(e,'/guilds/'+ch.guild_id),discordRead(e,`/guilds/${ch.guild_id}/roles`),discordRead(e,`/guilds/${ch.guild_id}/members/${me.id}`)]);
   const perm=channelPerm(guild,roles,bot,ch,me.id),readable=(perm&66560n)===66560n;
   if(b.watch){if(ch.type!==0||!readable)return json({error:'bot cannot read text channel'},400);const cfg=await get(e,'config:'+guild.id)||{guild_id:guild.id,channels:[],role_policy:{viewer:[],moderator:[],admin:[]},naming:'original',folder_per_channel:false,max_attachment_bytes:25000000};await set(e,'config:'+guild.id,{...cfg,channels:[...new Set([...cfg.channels,String(ch.id)])],replace_messages:false,introduce_channels:false,updated_at:new Date().toISOString()});}
   return json({channel_id:ch.id,name:ch.name,type:ch.type,guild_id:guild.id,guild_name:guild.name,bot_id:me.id,bot_name:me.username,readable});
  }
  if(p==='/internal/config' &&r.method==='GET')return json({servers:await all(e,'config:')});
  if(p.startsWith('/internal/channel/')){
   const id=p.split('/').pop();let ch=await get(e,'channel:'+id);
   if(r.method==='POST'){
    const b=await r.json();if(!/^\d+$/.test(id)||!/^\d+$/.test(String(b.guild_id)))return json({error:'bad channel'},400);
    if(!ch){const token=random();ch={id,guild_id:String(b.guild_id),name:b.name,token,token_hash:await hash(token),policy:b.policy||{},introduced:false};await set(e,'channel:'+id,ch)}
   }
   if(r.method==='PATCH'&&ch){const b=await r.json();ch={...ch,...Object.fromEntries(Object.entries(b).filter(([k])=>['introduced','policy','topic_url'].includes(k)))};await set(e,'channel:'+id,ch)}
   return ch?json(ch):json({error:'not found'},404);
  }
  if(p==='/internal/records'&&r.method==='GET')return json(await all(e,'photo:'));
  if(p==='/internal/records'&&r.method==='POST'){
   const b=await r.json();if(!/^[a-f0-9]{32}$/.test(b.id)||!await get(e,'channel:'+b.channel_id))return json({error:'bad record'},400);
   const prior=await get(e,'photo:'+b.id);await set(e,'photo:'+b.id,prior?{...prior,repost_id:b.repost_id,deleted:b.deleted}:b);return json({ok:true});
  }
  if(p.startsWith('/internal/media/')&&r.method==='PUT'){
   const key=decodeURIComponent(p.slice(16));if(!/^[a-f0-9]{32}$/.test(key))return json({error:'bad key'},400);
   const data=await r.arrayBuffer();if(data.byteLength>25000000)return json({error:'too large'},413);
   const previous=await e.FILES.head('album/'+key),usage=await get(e,'quota:archive')||{bytes:0,objects:0};if(usage.bytes+data.byteLength-(previous?.size||0)>Number(e.ARCHIVE_MAX_BYTES||8000000000)||(!previous&&usage.objects>=Number(e.ARCHIVE_MAX_OBJECTS||25000)))return json({error:'archive safety limit'},413);await set(e,'quota:archive',{bytes:Math.max(0,usage.bytes+data.byteLength-(previous?.size||0)),objects:usage.objects+(previous?0:1)});
   await e.FILES.put('album/'+key,data,{httpMetadata:{contentType:r.headers.get('Content-Type')||'application/octet-stream'}});return json({ok:true});
  }
  return json({error:'not found'},404);
 }
 if(p==='/auth/login'){
  if(!e.DISCORD_CLIENT_ID||!e.DISCORD_CLIENT_SECRET)return page('Discord login not configured','<p>Ask the owner to finish OAuth setup.</p>');
  const state=random();await set(e,'oauth:'+await hash(state),{exp:Date.now()+300000});
  const q=new URLSearchParams({client_id:e.DISCORD_CLIENT_ID,redirect_uri:e.PUBLIC_URL+'/auth/callback',response_type:'code',scope:'identify',state});
  return redirect('https://discord.com/oauth2/authorize?'+q,{'Set-Cookie':`album_state=${state}; HttpOnly; Secure; SameSite=Lax; Path=/auth; Max-Age=300`});
 }
 if(p==='/auth/callback'){
  const state=u.searchParams.get('state');const key='oauth:'+await hash(state||'');const x=await get(e,key);
  if(!state||state!==cookie(r,'album_state')||!x||x.exp<Date.now())return json({error:'invalid state'},403);
  await e.DB.prepare('DELETE FROM album WHERE key=?').bind(key).run();
  const tr=await fetch('https://discord.com/api/v10/oauth2/token',{method:'POST',body:new URLSearchParams({client_id:e.DISCORD_CLIENT_ID,client_secret:e.DISCORD_CLIENT_SECRET,grant_type:'authorization_code',code:u.searchParams.get('code'),redirect_uri:e.PUBLIC_URL+'/auth/callback'})});if(!tr.ok)return json({error:'OAuth failed'},403);
  const t=await tr.json(),me=await fetch('https://discord.com/api/v10/users/@me',{headers:{Authorization:`Bearer ${t.access_token}`}});if(!me.ok)return json({error:'OAuth failed'},403);
  const user=await me.json(),sid=random();await set(e,'session:'+await hash(sid),{user_id:user.id,exp:Date.now()+3600000});
  return redirect('/',{'Set-Cookie':`album_session=${sid}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=3600`});
 }
 if(p==='/auth/logout'&&r.method==='POST'){
  if(r.headers.get('Origin')!==u.origin)return json({error:'origin'},403);
  const sid=cookie(r,'album_session');if(sid)await e.DB.prepare('DELETE FROM album WHERE key=?').bind('session:'+await hash(sid)).run();
  return redirect('/',{'Set-Cookie':'album_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'});
 }
 const channelMatch=p.match(/^\/channel\/(\d+)(\/policy|\/rotate)?$/),photoMatch=p.match(/^\/(photo|media)\/([a-f0-9]{32})$/);
 if(channelMatch){
  const ch=await get(e,'channel:'+channelMatch[1]);if(!ch)return json({error:'not found'},404);
  if(channelMatch[2]){
   if(r.method==='GET'&&channelMatch[2]==='/policy'&&await memberRole(r,e,ch)==='admin')return page('Channel permissions',`<form method=post><p>Discord role IDs, comma separated. Channel visibility is still required.</p>${['viewer','moderator','admin'].map(k=>`<p><label>${k}<br><input name=${k} value="${esc((ch.policy?.[k]||[]).join(','))}"></label></p>`).join('')}<button>Save permissions</button></form><form method=post action=/channel/${ch.id}/rotate><p>Rotation invalidates every old library token. The bot announces the replacement on its next introduction check.</p><button>Rotate library token</button></form>`,true);
   if(r.method!=='POST'||r.headers.get('Origin')!==u.origin||await memberRole(r,e,ch)!=='admin')return json({error:'forbidden'},403);
   if(channelMatch[2]==='/rotate'){ch.token=random();ch.token_hash=await hash(ch.token);ch.introduced=false;}
   else {const policy=r.headers.get('Content-Type')?.includes('application/json')?await r.json():Object.fromEntries([...await r.formData()].map(([k,v])=>[k,String(v).split(',').map(x=>x.trim()).filter(Boolean)]));if(!['viewer','moderator','admin'].every(k=>Array.isArray(policy[k])&&policy[k].every(x=>/^\d+$/.test(x))))return json({error:'invalid roles'},400);ch.policy=policy;}
   await set(e,'channel:'+ch.id,ch);return json({ok:true,url:channelMatch[2]==='/rotate'?e.PUBLIC_URL+'/channel/'+ch.id+'?token='+ch.token:undefined});
  }
  if(!await allowed(r,e,ch))return json({error:'not found'},404);
  const rows=[];for(const x of await all(e,'photo:'))if(String(x.channel_id)===ch.id&&await sourceVisible(r,e,x))rows.push(x);const token=u.searchParams.get('token'),q=token?'?token='+encodeURIComponent(token):'';
  const captions=new Map(),mentionCache=new Map();for(const x of rows)captions.set(x.id,await captionDisplay(e,x,mentionCache));
  const sort=['posted','saved','name'].includes(u.searchParams.get('sort'))?u.searchParams.get('sort'):'posted',direction=u.searchParams.get('direction')==='asc'?'asc':'desc';
  rows.sort((a,b)=>{const value=sort==='name'?String(a.original||'').localeCompare(String(b.original||'')):(Date.parse(sort==='saved'?a.saved_at:a.posted_at)||0)-(Date.parse(sort==='saved'?b.saved_at:b.posted_at)||0);return (direction==='asc'?1:-1)*value||String(a.id).localeCompare(String(b.id))});
  return page((await guildName(e,ch.guild_id))+' | #'+ch.name,`<p class=dim>${rows.length} photos and videos · channel library</p>${await memberRole(r,e,ch)==='admin'?`<p><a href=/channel/${ch.id}/policy>Manage permissions and invite token</a></p>`:''}<form><input name=token type=hidden value="${esc(token||'')}"><input name=q placeholder="Search captions or names" value="${esc(u.searchParams.get('q')||'')}"><select name=sort aria-label="Sort by">${[['posted','Message date'],['saved','Archived date'],['name','Filename']].map(([value,label])=>`<option value="${value}" ${sort===value?'selected':''}>${label}</option>`).join('')}</select> <select name=direction aria-label="Order"><option value=desc ${direction==='desc'?'selected':''}>Newest first / Z-A</option><option value=asc ${direction==='asc'?'selected':''}>Oldest first / A-Z</option></select> <button>Apply</button></form><br><div class=grid>${rows.filter(x=>JSON.stringify([x.caption,captions.get(x.id).plain,x.author,x.original]).toLowerCase().includes((u.searchParams.get('q')||'').toLowerCase())).map(x=>{const c=captions.get(x.id);return `<article>${videoRecord(x)?mediaElement({...x,caption:c.plain},q,true):`<a data-lightbox href="/photo/${x.id}${q}" aria-label="View ${esc(c.plain)}">${mediaElement({...x,caption:c.plain},q,true)}</a>`}${c.block?'<div class=cap>':'<p>'}${c.html}<br><span class=dim>${esc(displayAuthor(x))}</span><br><a class=action data-lightbox href="/photo/${x.id}${q}">${icons.image} View</a>${discordMessageLink(x)?` <a class=action href="${esc(discordMessageLink(x).url)}" target=_blank rel="noopener noreferrer" aria-label="Open message" title="Open message">${icons['message-square']}</a>`:''}${c.block?'</div>':'</p>'}</article>`}).join('')}</div>${shareDialog()}<dialog id=lightbox aria-label="Media viewer"><div class=modalbar><div class=actionrow><button class=action data-prev aria-label="Previous media">${icons['chevron-left']}</button><button class=action data-next aria-label="Next media">${icons['chevron-right']}</button></div><div class=actionrow><a class=action data-new-tab target=_blank rel="noopener noreferrer">${icons['external-link']} New tab</a><button class=action data-close aria-label="Close viewer">${icons.x}</button></div></div><p class=modalstatus data-status aria-live=polite></p><div data-content></div></dialog>`);
 }
 if(/^\/photo\/[a-f0-9]{32}\/reindex$/.test(p)){
  const rec=await get(e,'photo:'+p.split('/')[2]),ch=rec&&await get(e,'channel:'+rec.channel_id),session=await signedIn(r,e);
  if(!rec||!ch||!session||await memberRole(r,e,ch)!=='admin'||!await sourceVisible(r,e,rec))return json({error:'forbidden'},403);
  if(r.method!=='POST')return json({error:'method'},405);
  if(r.headers.get('Origin')!==u.origin)return json({error:'origin'},403);
  const config=await get(e,'config:'+ch.guild_id);if(!config?.channels.includes(ch.id))return json({error:'Channel no longer watched'},409);
  if((await all(e,'reindex:')).some(j=>j.channel_id===ch.id&&['queued','running'].includes(j.status)))return json({error:'Reindex already queued or running'},409);
  if(!/^\d+$/.test(String(rec.message_id)))return json({error:'Original message unavailable'},409);
  const job={id:random(),guild_id:ch.guild_id,channel_id:ch.id,photo_id:rec.id,message_id:String(rec.message_id),requested_by:session.user_id,status:'queued',scanned:0,saved:0,unresolved:0,created_at:new Date().toISOString()};await set(e,'reindex:'+job.id,job);return json({ok:true,job_id:job.id,status:'queued'});
 }
 if(photoMatch){
  const rec=await get(e,'photo:'+photoMatch[2]);if(!rec)return json({error:'not found'},404);
  if(!await sourceVisible(r,e,rec))return json({error:'not found'},404);
  const ch=await get(e,'channel:'+rec.channel_id),grant=ch&&await allowed(r,e,ch),token=u.searchParams.get('token'),q=token&&await photoToken(r,e,rec,ch)?'?token='+encodeURIComponent(token):'';
  if(r.method==='DELETE'){if(r.headers.get('Origin')!==u.origin||!['admin','moderator'].includes(ch&&await memberRole(r,e,ch)))return json({error:'forbidden'},403);await e.DB.prepare('DELETE FROM album WHERE key=?').bind('photo:'+rec.id).run();return json({ok:true});}
  if(r.method!=='GET')return json({error:'method'},405);
  if(photoMatch[1]==='media'){
   if(rec.cdn_url){const src=new URL(rec.cdn_url);if(src.protocol!=='https:'||!['cdn.hackclub.com','cdn.hackclub-assets.com'].includes(src.hostname))return json({error:'bad CDN'},503);const cr=await fetch(src,{redirect:'error'});if(!cr.ok)return json({error:'media unavailable'},503);return new Response(cr.body,{headers:{...safeHeaders,'Content-Type':cr.headers.get('Content-Type')||'application/octet-stream','Content-Security-Policy':"default-src 'none'; sandbox"}})}
   const config=await get(e,'config:'+ch.guild_id),preview=u.searchParams.get('preview')==='1'&&config?.compress_previews!==false&&rec.has_preview;
   if(u.searchParams.get('preview')==='1'&&config?.compress_previews!==false&&!rec.has_preview)return new Response(Uint8Array.from(atob(images['logo.png']),c=>c.charCodeAt(0)),{headers:{...safeHeaders,'Content-Type':'image/png'}});
   const key='album/'+(preview?'preview/':'')+rec.id;
   if(!preview&&u.searchParams.get('discord')!=='no'&&await photoToken(r,e,rec,ch)){const attachment=await discordAttachment(e,rec);if(attachment)return redirect(attachment)}
   const head=await e.FILES.head(key);if(!head)return json({error:'not found'},404);
   const size=head.size,raw=r.headers.get('Range');let range=null;
   if(raw){const match=raw.match(/^bytes=(\d*)-(\d*)$/);if(!match||(!match[1]&&!match[2]))return new Response(null,{status:416,headers:{...safeHeaders,'Content-Range':`bytes */${size}`}});let start=match[1]?Number(match[1]):Math.max(0,size-Number(match[2])),end=match[1]?(match[2]?Math.min(Number(match[2]),size-1):size-1):size-1;if(start>=size||end<start)return new Response(null,{status:416,headers:{...safeHeaders,'Content-Range':`bytes */${size}`}});range={offset:start,length:end-start+1};}
   const blob=await e.FILES.get(key,range?{range}:undefined);if(!blob)return json({error:'not found'},404);
   return new Response(blob.body,{status:range?206:200,headers:{...safeHeaders,'Accept-Ranges':'bytes','Content-Length':String(range?.length??size),...(range?{'Content-Range':`bytes ${range.offset}-${range.offset+range.length-1}/${size}`} : {}),'Content-Type':preview?'image/webp':rec.content_type||blob.httpMetadata?.contentType||'application/octet-stream','Content-Security-Policy':"default-src 'none'; sandbox"}});
  }
  const caption=await captionDisplay(e,rec,new Map()),shareAllowed=true,isAdmin=ch&&await memberRole(r,e,ch)==='admin';
  return page((ch?await guildName(e,ch.guild_id):'Discord server')+' | #'+(ch?.name||rec.channel||'channel'),`<div class=detail>${mediaElement({...rec,caption:caption.plain},q)}${caption.block?`<div class="cap cap-detail">${caption.html}</div>`:`<h2>${caption.html}</h2>`}<div class=actionrow>${shareAllowed?`<button class=action data-share="${rec.id}" data-share-token="${esc(token||'')}" data-gallery-enabled="${grant?'yes':'no'}">${icons['share-2']} Share</button>`:''}${discordMessageLink(rec)?`<a class=action href="${esc(discordMessageLink(rec).url)}" target=_blank rel="noopener noreferrer" aria-label="Open message" title="Open message">${icons['message-square']}</a>`:''}${isAdmin?`<button class=action data-reindex="${rec.id}" aria-label="Reindex this image">${icons['refresh-cw']||icons['image']} Reindex</button>`:''}</div><p data-reindex-status role=status></p><p class=dim>${esc(displayAuthor(rec))} · ${esc(rec.posted_at)}</p>${grant?`<a href="/channel/${ch.id}${q}">Open channel library</a>`:'<p class=dim>This link opens one photo only. Use your channel invite link or Discord login to browse the library.</p>'}</div>${shareDialog()}`);
 }
 if(p==='/'){
  const channels=await all(e,'channel:'),visible=[];for(const ch of channels)if(await memberRole(r,e,ch))visible.push(ch);
  const session=await signedIn(r,e);
  const records=visible.length?await all(e,'photo:'):[],cards=[],groups=new Map(),names=new Map();let photos=0,videos=0;
  for(const ch of visible){
   const items=[];for(const x of records)if(String(x.channel_id)===ch.id&&await sourceVisible(r,e,x))items.push(x);
   items.sort((a,b)=>(Date.parse(b.posted_at)||0)-(Date.parse(a.posted_at)||0));
   const pc=items.filter(x=>!videoRecord(x)).length,vc=items.length-pc;photos+=pc;videos+=vc;
   const covers=items.filter(x=>!videoRecord(x)).slice(0,3),latest=items.find(x=>Number.isFinite(Date.parse(x.posted_at)))?.posted_at;
   const server=await guildName(e,ch.guild_id,names);if(!groups.has(ch.guild_id))groups.set(ch.guild_id,{name:server,cards:[]});
   groups.get(ch.guild_id).cards.push(`<a class=library-card href="/channel/${ch.id}" aria-label="Open ${esc(ch.name)} library"><div class=mosaic style="grid-template-columns:${covers.length===1?'1fr':covers.length===2?'2fr 1fr':'2fr 1fr 1fr'}">${covers.length?covers.map(x=>`<img loading=lazy alt="" src="/media/${x.id}?preview=1">`).join(''):'<div class=blank>Gallery</div>'}</div><div class=library-copy><span class=dim>Channel library</span><h3>${esc(server)} | #${esc(ch.name)}</h3><div class=statline><span><strong class=library-count>${pc}</strong><br>Photos</span><span><strong class=library-count>${vc}</strong><br>Videos</span></div><p class=dim>${latest?'Latest message '+esc(latest.slice(0,10)):'No archived media yet'}</p><span class=library-action>Open library</span></div></a>`);
  }
  return page('Libraries',`<div class=libraries><div class=library-top><div><p class=dim>Your Discord archive</p><h2>All your libraries</h2><p class=dim>Photos, videos and the conversations behind them.</p></div><span class=dim>${visible.length} ${visible.length===1?'library':'libraries'} available</span></div><div class=bento>${[...groups].map(([id,g])=>`<section class=server-group><div class=library-top><h3>${esc(g.name)}</h3><span class=dim>${g.cards.length} ${g.cards.length===1?'channel':'channels'}</span></div><div class=channel-tiles>${g.cards.join('')}</div></section>`).join('')||`<section class=library-empty><h3>${session?'No libraries available yet':'Your libraries are private'}</h3><p class=dim>${session?'Open a channel invite link, or check your library role in Settings.':'Sign in with Discord to see the libraries you can access, or open your channel invite link.'}</p><a class=library-action href=${session?'/settings':'/auth/login'}>${session?'Configure servers':'Sign in with Discord'}</a></section>`}<aside class=side-stack><section class=side-card><h3>Your archive</h3><div class=statline><span><strong class=library-count>${photos}</strong><br>Photos</span><span><strong class=library-count>${videos}</strong><br>Videos</span></div><p>Only libraries and media you can access are shown.</p></section><section class=side-card><h3>${session?'Connected to Discord':'Discord sign-in'}</h3><p>${session?'Your server roles control library access.':'Sign in to browse your server libraries.'}</p><a class=library-action href=${session?'/settings':'/auth/login'}>${session?'Configure servers':'Sign in'}</a>${session?'<form method=post action=/auth/logout style="margin-top:16px"><button>Sign out</button></form>':''}</section></aside></div></div>`,true);
 }
 return json({error:'not found'},404);
 }catch(err){console.error('Album request failed:',err.message);return json({error:'request failed'},503)}
}
export default {fetch:handle};
