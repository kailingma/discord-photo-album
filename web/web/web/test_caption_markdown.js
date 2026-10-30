import assert from'node:assert/strict';import{captionDisplay}from'./app.js';
const e={DISCORD_TOKEN:'dummy'},rec=c=>({caption:c,guild_id:'1'}),run=(c)=>captionDisplay(e,rec(c),new Map());
// Mock Discord API for mention resolution: member 5 has a nick, roles list has Mods; everything else errors.
globalThis.fetch=async url=>url.includes('/members/5')?new Response(JSON.stringify({nick:'KaiM',user:{global_name:'Kai',username:'kai'}})):url.endsWith('/roles')?new Response(JSON.stringify([{id:'2',name:'Mods'}])):new Response('x',{status:403});
// Plain text passes through escaped
let r=await run('a <b> & "q"');assert.equal(r.html,'a &lt;b&gt; &amp; &quot;q&quot;');assert.equal(r.plain,'a <b> & "q"');
// Allowed link schemes render as safe anchors
r=await run('[photos](https://example.com/a?x=1&y=2)');assert.equal(r.html,'<a href="https://example.com/a?x=1&amp;y=2" target=_blank rel="noopener noreferrer">photos</a>');assert.equal(r.plain,'photos');
r=await run('[mirror](http://example.com) and [mail](mailto:a@b.c)');assert(r.html.includes('href="http://example.com/"')&&r.html.includes('href="mailto:a@b.c"'));assert.equal(r.plain,'mirror and mail');
// Angle-bracket destination form
r=await run('[doc](<https://example.com/a b>)');assert(r.html.includes('href="https://example.com/a%20b"'),r.html);
// Unsafe/malformed destinations stay literal, never stripped into allowed ones
for(const bad of ['[x](javascript:alert(1))','[x](data:text/html;base64,PHN2Zz4=)','[x](vbscript:msgbox)','[x](jav%09ascript:alert(1))','[x](java&#115;cript:alert(1))','[x](//evil.example)','[x](https://exa mple.com)','[x](notaurl)','[x](https://ok.example','[x]()','[](https://ok.example)','[x](https://ok.example "title")']){
 r=await run(bad);assert(!r.html.includes('<a '),`unsafe rendered: ${bad} -> ${r.html}`);assert.equal(r.plain,bad,'raw preserved: '+bad);
}
// Real control chars never reach the rendered href: trailing-whitespace case renders the clean URL only, scheme-laundering case stays literal
r=await run('[x](https://ok.example/\t)');assert(!/[\x00-\x20]/.test(r.html.replace(/<[^>]*>/g,''))||!r.html.includes('\t'));if(r.html.includes('<a '))assert(r.html.includes('href="https://ok.example/"'),r.html);
r=await run('[x](jav\tascript:alert(1))');assert(!r.html.includes('<a '),r.html);
// Nested/broken syntax never produces an anchor to the inner destination
r=await run('[[a](javascript:alert(1))](https://ok.example)');assert(!r.html.includes('<a '),r.html);
// Link text and href are escaped
r=await run('[a "q" <b>](https://example.com/?x="1")');assert(r.html.includes('a &quot;q&quot; &lt;b&gt;')&&!r.html.includes('<b>'),r.html);
// Mentions: known nick, unknown fallback, role, privacy-preserving channel, malformed
r=await run('hi <@5>');assert.equal(r.html,'hi <span class=mention>@KaiM</span>');
r=await run('hi <@9>');assert(r.html.includes('@unknown user'));
r=await run('<@&2> only');assert(r.html.includes('@Mods'));
r=await run('see <#9>');assert(r.html.includes('#unknown channel'),r.html);assert(!r.html.includes('href'));
r=await run('<@abc> <@> <!@5> <@5');assert(!r.html.includes('mention'),r.html);
// Mixed mention + link in one caption
r=await run('<@5> shared [photos](https://example.com)');assert(r.html.includes('@KaiM')&&r.html.includes('<a href='));assert.equal(r.plain,'@KaiM shared photos');
console.log('Caption Markdown link allowlist, escaping, malformed/nested rejection and mention rendering tests passed');
