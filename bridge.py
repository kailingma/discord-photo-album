"""Shared gateway for local and Workers editions. No copied variant code."""
import asyncio, os, secrets, re, json, tempfile, sys
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import urlparse
import aiohttp
import discord
from archiver import Config, Store, Archiver, is_image, is_media
from pathlib import Path

class AlbumAPI:
    def __init__(self, session):
        self.session=session
        self.url=os.environ['ALBUM_URL'].rstrip('/')
        if not (self.url.startswith('https://') or urlparse(self.url).hostname in ('127.0.0.1','localhost')):
            raise ValueError('ALBUM_URL must be HTTPS or loopback')
        self.headers={'Authorization':'Bearer '+os.environ['BRIDGE_TOKEN']}
    async def call(self, method, path, **kw):
        async with self.session.request(method,self.url+path,headers={**self.headers,**kw.pop('headers',{})},**kw) as r:
            if r.status==404 and method=='GET':return None
            if r.status>=400:raise RuntimeError('Album API returned '+str(r.status))
            return await r.json()
    async def channel(self,ch,policy):
        return await self.call('POST','/internal/channel/'+str(ch.id),json={'guild_id':str(ch.guild.id),'name':ch.name,'policy':policy})
    async def put(self,key,data,kind):
        # Archiver creates names, bridge stores photo bytes under random IDs.
        self.pending=(data,kind)

class BridgeStore:
    """Remote records are authoritative; local cache must never block retry."""
    def all(self):return []
    def next_seq(self):return self.seq+1
    def add(self,r):self.seq=r["seq"];return r
    seq=0

class PhotoBot(discord.Client):
    def __init__(self,cfg,arch,api):
        i=discord.Intents.default();i.message_content=True
        super().__init__(intents=i)
        self.cfg,self.arch,self.api=cfg,arch,api
        self.lock=asyncio.Lock()
        self.remote_configs=None
        self.config_task=None
        self.job_task=None
        Path(self.cfg['data_dir']).mkdir(parents=True,exist_ok=True)
    async def introduce(self,ch):
        x=await self.api.channel(ch,self.cfg.data.get('role_policy',{}))
        link=self.api.url+'/channel/'+str(ch.id)+'?token='+x['token']
        if not x['introduced']:
            if not isinstance(ch,discord.TextChannel):raise ValueError('Only guild text channels supported')
            old=ch.topic or ''
            if x.get('topic_url'):old=old.removeprefix(x['topic_url']+'\n')
            if not old.startswith(link):
                if len(link+'\n'+old)>1024:raise ValueError('Channel topic too long; shorten it before introduction')
                await ch.edit(topic=link+'\n'+old,reason='Photo album invite')
            # Search on recovery before repeating the introduction message.
            exists=False
            async for m in ch.history(limit=100):
                if m.author.id==self.user.id and link in m.content:exists=True;break
            if not exists:await ch.send('[(View Gallery)]('+link+')',suppress_embeds=True,allowed_mentions=discord.AllowedMentions.none())
            await self.api.call('PATCH','/internal/channel/'+str(ch.id),json={'introduced':True,'topic_url':link})
        return x
    async def refresh_remote(self):
        if os.environ.get('REMOTE_CONFIG') != 'yes':return
        try:
            result=await self.api.call('GET','/internal/config')
            servers=result.get('servers',[])
            if not isinstance(servers,list):raise ValueError('Invalid remote config')
            self.remote_configs={str(x['guild_id']):x for x in servers}
        except Exception as exc:
            # Do not continue using stale permissions/channel selection on failure.
            self.remote_configs={}
            print('Remote configuration unavailable; processing paused:',type(exc).__name__,flush=True)
    async def watch_remote(self):
        while not self.is_closed():
            await self.refresh_remote()
            await asyncio.sleep(60)
    def server_config(self,guild_id):
        self.cfg.reload()
        if os.environ.get('REMOTE_CONFIG') != 'yes':return self.cfg
        config=(self.remote_configs or {}).get(str(guild_id))
        if not config:return None
        # Gateway activation is a separate operator action after a private test.
        selected=Config(self.cfg.path)
        selected.data={**selected.data,**{k:v for k,v in config.items() if k in selected.data}}
        selected.data['channels']=[int(x) for x in config.get('channels',[])]
        return selected
    async def on_ready(self):
        print('Discord gateway ready',flush=True)
        await self.refresh_remote()
        if os.environ.get('REMOTE_CONFIG') == 'yes' and not self.config_task:
            self.config_task=asyncio.create_task(self.watch_remote())
        if not self.job_task:
            self.job_task=asyncio.create_task(self.watch_jobs())
        # Introduction/topic effects remain available behind their explicit flag.
        for guild in self.guilds:
            cfg=self.server_config(guild.id)
            if not cfg or not cfg.data.get('introduce_channels',False):continue
            async with self.lock:
                previous=self.cfg;self.cfg=cfg;self.arch.config=cfg
                try:
                    for cid in cfg['channels']:
                        ch=self.get_channel(cid) or await self.fetch_channel(cid)
                        if str(ch.guild.id)!=str(guild.id):continue
                        try:await self.introduce(ch)
                        except Exception as exc:print('Introduction blocked:',cid,type(exc).__name__,flush=True)
                finally:self.cfg=previous;self.arch.config=previous
    async def on_message(self,m):
        if m.author.bot or m.webhook_id or not m.guild:return
        async with self.lock:
            cfg=self.server_config(m.guild.id)
            if not cfg or m.channel.id not in cfg['channels']:return
            previous=self.cfg;self.cfg=cfg;self.arch.config=cfg
            try:
                if cfg.data.get("replace_messages",False):await self.replace(m)
                else:await self.archive_only(m)
            except Exception as exc:print('Replacement paused; original retained:',m.id,type(exc).__name__,flush=True)
            finally:self.cfg=previous;self.arch.config=previous
    async def save_attachment(self,a,m,provenance=None,record_id=None):
        self.api.pending=None
        rec=await self.arch.archive_attachment(a,m)
        if not rec:raise RuntimeError('Local-only orphan record needs reconciliation')
        rec['id']=record_id or secrets.token_hex(16);rec['guild_id']=str(m.guild.id)
        for key in ('message_id','attachment_id','channel_id','author_id'):rec[key]=str(rec[key])
        data,kind=self.api.pending
        # Sanitize in a separate bounded worker, one media item at a time.
        original_url=str(getattr(a,'url',''))
        with tempfile.TemporaryDirectory(dir=self.cfg['data_dir']) as d:
            source=Path(d)/'source';target=Path(d)/'clean';source.write_bytes(data)
            proc=await asyncio.create_subprocess_exec(sys.executable,str(Path(__file__).with_name('media_processor.py')),str(source),str(target),a.filename,rec.get('media_kind','image'),'yes',stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE)
            try:_,err=await asyncio.wait_for(proc.communicate(),timeout=90)
            except asyncio.TimeoutError:
                proc.kill();await proc.wait();raise ValueError('Metadata worker timed out; original retained')
            if proc.returncode:raise ValueError('Metadata cleanup failed; original retained')
            clean=target.read_bytes();info=json.loads(Path(str(target)+'.json').read_text());rec.update(info);rec['content_type']=info['mime'];rec['size_bytes']=len(clean);rec['attachment_url']=original_url
            await self.api.call('PUT','/internal/media/'+rec['id'],data=clean,headers={'Content-Type':info['mime']})
            thumbnail=Path(str(target)+'.preview')
            if thumbnail.exists():
                await self.api.call('PUT','/internal/preview/'+rec['id'],data=thumbnail.read_bytes(),headers={'Content-Type':'image/webp'});rec['has_preview']=True
        if provenance:rec.update(provenance)
        await self.api.call('POST','/internal/records',json=rec)
        return rec

    async def archive_only(self,m,refresh_id=None):
        # No Discord write methods on this path, even with replacement enabled.
        await self.api.channel(m.channel,self.cfg.data.get('role_policy',{}))
        if not m.attachments and not getattr(m,'message_snapshots',[]) and 'discord' not in (m.content or ''):return 0,[]
        existing=await self.api.call('GET','/internal/records')
        known={(str(x['channel_id']),str(x['message_id']),str(x['attachment_id'])) for x in existing}
        target=next((x for x in existing if x['id']==refresh_id),None) if refresh_id else None
        if refresh_id and (not target or str(target['channel_id'])!=str(m.channel.id) or str(target['message_id'])!=str(m.id)):raise ValueError('Photo does not match original message')
        sources=[];issues=[];seen=set();queue=[(m,'direct',0)]
        while queue:
            source,kind,depth=queue.pop(0)
            key=(str(source.channel.id),str(source.id))
            if key in seen:continue
            seen.add(key)
            for a in source.attachments:
                if is_media(a.filename,a.content_type):sources.append((a,source,kind))
            for snapshot in getattr(source,'message_snapshots',[]):
                # Forwarded snapshots are already visible in the watched channel.
                snap=SimpleNamespace(id=source.id,channel=source.channel,guild=source.guild,
                    author=SimpleNamespace(display_name='Author Unknown',id=0),
                    content=snapshot.content,created_at=snapshot.created_at,jump_url=source.jump_url)
                for a in snapshot.attachments:
                    if is_media(a.filename,a.content_type):sources.append((a,snap,'forwarded_snapshot'))
            links=re.findall(r'https://(?:(?:canary|ptb)\.)?discord(?:app)?\.com/channels/(\d+)/(\d+)/(\d+)(?!\d)',source.content or '')
            ref=getattr(source,'reference',None)
            if getattr(source,'message_snapshots',[]) and ref and ref.message_id:
                links.append((str(ref.guild_id or source.guild.id),str(ref.channel_id),str(ref.message_id)))
            if depth>=5:
                if links:issues.append({'message_id':str(m.id),'reason':'link depth limit'})
                continue
            for gid,cid,mid in links[:20]:
                # Source-channel permissions are retained for cross-channel copies.
                if gid!=str(m.guild.id):
                    issues.append({'message_id':str(m.id),'source_channel_id':cid,'reason':'cross-server original not copied'});continue
                try:
                    linked_channel=self.get_channel(int(cid)) or await self.fetch_channel(int(cid))
                    if not isinstance(linked_channel,discord.TextChannel) or str(linked_channel.guild.id)!=gid:raise ValueError('Unsupported linked channel')
                    p=linked_channel.permissions_for(linked_channel.guild.me)
                    if not p.view_channel or not p.read_message_history:raise ValueError('Original not accessible')
                    queue.append((await linked_channel.fetch_message(int(mid)),'message_link',depth+1))
                except (discord.Forbidden,discord.NotFound,ValueError):issues.append({'message_id':str(m.id),'source_message_id':mid,'reason':'original unavailable'})
        saved=0
        # Prefer fetched originals over snapshots of the same attachment.
        sources.sort(key=lambda item:item[2]=='forwarded_snapshot')
        for a,source,kind in sources:
            if target and str(a.id)!=str(target['attachment_id']):continue
            if target and target.get('source_kind')!='forwarded_snapshot' and kind=='forwarded_snapshot':raise ValueError('Original unavailable; existing attributed record retained')
            key=(str(m.channel.id),str(m.id),str(a.id))
            previous=next((x for x in existing if (str(x['channel_id']),str(x['message_id']),str(x['attachment_id']))==key),None)
            upgrade=previous and previous.get('source_kind')=='forwarded_snapshot' and kind!='forwarded_snapshot'
            if key in known and not target and not upgrade:continue
            if a.size>min(self.cfg['max_attachment_bytes'],25000000):
                issues.append({'message_id':str(m.id),'reason':'media exceeds 25 MB safety limit: '+a.filename[:80]});continue
            proxy=SimpleNamespace(id=m.id,channel=m.channel,guild=m.guild,author=source.author,
                content=m.content or source.content,created_at=source.created_at,jump_url=m.jump_url)
            await self.save_attachment(a,proxy,{'source_kind':kind,'source_message_id':str(source.id),
                'source_channel_id':str(source.channel.id),'source_jump_url':source.jump_url,
                **({'protected_source_channel_id':str(source.channel.id)} if source.channel.id!=m.channel.id else {})},record_id=refresh_id if target else previous['id'] if upgrade else None)
            known.add(key);saved+=1
            if target:break
        if target and not saved:raise ValueError('Original attachment no longer available')
        return saved,issues

    async def watch_jobs(self):
        while not self.is_closed():
            try:
                cleanup=await self.api.call('GET','/internal/cleanup')
                for job in cleanup or []:await self.run_cleanup(job)
                jobs=await self.api.call('GET','/internal/reindex')
                for job in jobs or []:await self.run_reindex(job)
            except Exception as exc:print('Manual reindex check paused:',type(exc).__name__,flush=True)
            await asyncio.sleep(60)

    async def run_cleanup(self,job):
        report=dict(job);jid=job['id'];report['status']='running'
        await self.api.call('PATCH','/internal/cleanup/'+jid,json=report)
        try:
            await self.refresh_remote();cfg=self.server_config(job['guild_id'])
            if not cfg:raise ValueError('Server not configured')
            records=await self.api.call('GET','/internal/records')
            for rec in records:
                if rec.get('guild_id')!=job['guild_id'] or rec.get('id') in report.get('done_ids',[]):continue
                checked=await self.api.call('GET','/internal/cleanup/'+jid)
                if not checked or checked.get('status')=='cancelled':return
                async with self.lock:
                    try:
                        async with self.api.session.get(self.api.url+'/internal/media/'+rec['id'],headers=self.api.headers) as response:
                            if response.status!=200:raise ValueError('Archive bytes unavailable')
                            data=await response.read()
                        with tempfile.TemporaryDirectory(dir=self.cfg['data_dir']) as d:
                            source=Path(d)/'source';target=Path(d)/'clean';source.write_bytes(data)
                            proc=await asyncio.create_subprocess_exec(sys.executable,str(Path(__file__).with_name('media_processor.py')),str(source),str(target),rec['original'],rec.get('media_kind','image'),'yes',stdout=asyncio.subprocess.DEVNULL,stderr=asyncio.subprocess.PIPE)
                            try:await asyncio.wait_for(proc.communicate(),90)
                            except asyncio.TimeoutError:
                                proc.kill();await proc.wait();raise ValueError('Metadata worker timed out')
                            if proc.returncode:raise ValueError('Sanitizer could not verify file')
                            info=json.loads(Path(str(target)+'.json').read_text());clean=target.read_bytes()
                            await self.api.call('PUT','/internal/media/'+rec['id'],data=clean,headers={'Content-Type':info['mime']})
                            rec.update(info);rec['content_type']=info['mime'];rec['size_bytes']=len(clean)
                            thumb=Path(str(target)+'.preview')
                            if thumb.exists():await self.api.call('PUT','/internal/preview/'+rec['id'],data=thumb.read_bytes(),headers={'Content-Type':'image/webp'});rec['has_preview']=True
                            await self.api.call('PATCH','/internal/records/'+rec['id'],json=rec)
                        report['cleaned']=report.get('cleaned',0)+1
                    except Exception as exc:
                        report['failed']=report.get('failed',0)+1;report['issues']=(report.get('issues',[])+[{'id':rec['id'],'reason':str(exc)[:180]}])[-20:]
                report['done_ids']=report.get('done_ids',[])+[rec['id']];await self.api.call('PATCH','/internal/cleanup/'+jid,json=report)
            report['status']='completed'
        except Exception as exc:report['status']='blocked';report['error']=type(exc).__name__
        await self.api.call('PATCH','/internal/cleanup/'+jid,json=report)

    async def run_reindex(self,job):
        jid=job['id'];report=dict(job)
        try:
            await self.refresh_remote()
            cfg=self.server_config(job['guild_id'])
            if not cfg or int(job['channel_id']) not in cfg['channels']:raise ValueError('Channel no longer watched')
            ch=self.get_channel(int(job['channel_id'])) or await self.fetch_channel(int(job['channel_id']))
            if not isinstance(ch,discord.TextChannel) or str(ch.guild.id)!=job['guild_id']:raise ValueError('Invalid channel')
            permissions=ch.permissions_for(ch.guild.me)
            if not permissions.view_channel or not permissions.read_message_history:raise ValueError('Bot cannot read history')
            report['status']='running';await self.api.call('PATCH','/internal/reindex/'+jid,json=report)
            if job.get('photo_id'):
                checked=await self.api.call('GET','/internal/reindex/'+jid)
                if not checked or checked['status']=='cancelled':return
                m=await ch.fetch_message(int(job['message_id']))
                async with self.lock:
                    previous=self.cfg;self.cfg=cfg;self.arch.config=cfg
                    try:
                        checked=await self.api.call('GET','/internal/reindex/'+jid)
                        if not checked or checked['status']=='cancelled':return
                        saved,issues=await self.archive_only(m,refresh_id=job['photo_id'])
                    finally:self.cfg=previous;self.arch.config=previous
                report.update(status='completed',scanned=1,saved=saved,unresolved=len(issues),issues=issues[-20:])
                await self.api.call('PATCH','/internal/reindex/'+jid,json=report)
                return
            after=discord.Object(id=int(job['cursor'])) if job.get('cursor') else None
            async for m in ch.history(limit=None,oldest_first=True,after=after):
                # Revalidate requester permission/current selection at each checkpoint.
                checked=await self.api.call('GET','/internal/reindex/'+jid)
                if not checked or checked['status']=='cancelled':return
                async with self.lock:
                    current=self.server_config(job['guild_id'])
                    if not current or ch.id not in current['channels']:raise ValueError('Channel no longer watched')
                    previous=self.cfg;self.cfg=current;self.arch.config=current
                    try:
                        if m.author.id!=self.user.id:
                            saved,issues=await self.archive_only(m)
                            report['saved']=report.get('saved',0)+saved
                            report['unresolved']=report.get('unresolved',0)+len(issues)
                            report['issues']=(report.get('issues',[])+issues)[-20:]
                    finally:self.cfg=previous;self.arch.config=previous
                report['scanned']=report.get('scanned',0)+1;report['cursor']=str(m.id)
                await self.api.call('PATCH','/internal/reindex/'+jid,json=report)
            report['status']='completed'
        except Exception as exc:
            report['status']='blocked';report['error']=type(exc).__name__+': '+str(exc)[:200]
        await self.api.call('PATCH','/internal/reindex/'+jid,json=report)

    async def replace(self,m):
        images=[a for a in m.attachments if is_media(a.filename,a.content_type)]
        if sum(a.size for a in m.attachments)>25000000 or any(a.size>min(self.cfg['max_attachment_bytes'],25000000) for a in m.attachments):raise ValueError('Media safety limit exceeded; original retained')
        if not images:return
        if not self.cfg.data.get('replace_messages',False):return
        # Avoid destroying polls/stickers/unsupported metadata or losing non-image files.
        if m.stickers or getattr(m,'poll',None):raise ValueError('Unsupported rich message, retained')
        ch=await self.introduce(m.channel) if self.cfg.data.get('introduce_channels',False) else await self.api.channel(m.channel,self.cfg.data.get('role_policy',{}))
        records=await self.api.call('GET','/internal/records')
        known={str(x['attachment_id']):x for x in records if str(x['message_id'])==str(m.id)}
        saved=[]
        for a in images:
            rec=known.get(str(a.id))
            if not rec:rec=await self.save_attachment(a,m)
            saved.append(rec)
        if any(r.get('repost_id')=='posting' for r in saved):raise RuntimeError('Uncertain previous webhook send; manual reconciliation needed')
        if not all(r.get('repost_id') for r in saved):
            extras=[]
            for a in m.attachments:
                if a.size>self.cfg['max_attachment_bytes']:raise ValueError('Attachment too large')
                extras.append(discord.File(__import__('io').BytesIO(await a.read()),filename=a.filename))
            links=[f"[(View Gallery)]({self.api.url}/photo/{r['id']}?token={ch['token']})" for r in saved]
            content=(m.content+'\n' if m.content else '')+'\n'.join(links)
            chunks=[]
            while len(content)>2000:
                pos=content.rfind('\n',0,2000)
                if pos<1:pos=2000
                chunks.append(content[:pos]);content=content[pos:].lstrip('\n')
            chunks.append(content)
            hooks=await m.channel.webhooks();hook=next((h for h in hooks if h.name=='Photo archive' and h.user and h.user.id==self.user.id),None)
            if not hook:hook=await m.channel.create_webhook(name='Photo archive')
            # Durable uncertainty marker: a crash can never cause silent duplicate repost/deletion.
            for r in saved:r['repost_id']='posting';await self.api.call('POST','/internal/records',json=r)
            sent=[]
            for n,text in enumerate(chunks):
                out=await hook.send(text,username=m.author.display_name[:80],avatar_url=str(m.author.display_avatar.url),files=extras if n==0 else [],wait=True,suppress_embeds=True,allowed_mentions=discord.AllowedMentions.none())
                sent.append(str(out.id))
            for r in saved:r['repost_id']=','.join(sent);await self.api.call('POST','/internal/records',json=r)
        # Delete only after archive + every repost is durably confirmed.
        await m.delete()
        for r in saved:r['deleted']=True;await self.api.call('POST','/internal/records',json=r)
        if self.cfg['logs_channel_id']:
            log=self.get_channel(self.cfg['logs_channel_id'])
            if log:await log.send(f'Archived and replaced {len(saved)} photo(s) in <#{m.channel.id}>.',allowed_mentions=discord.AllowedMentions.none())

async def main():
    cfg=Config('config.json');root=Path(cfg['data_dir']);root.mkdir(parents=True,exist_ok=True)
    async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=120)) as session:
        api=AlbumAPI(session);store=BridgeStore();store.seq=max((r['seq'] for r in await api.call('GET','/internal/records')),default=0);arch=Archiver(cfg,store,root/'photos',api)
        bot=PhotoBot(cfg,arch,api)
        try:await bot.start(os.environ['DISCORD_TOKEN'])
        except discord.LoginFailure:print('Discord rejected token',flush=True)
        finally:await bot.close()
if __name__=='__main__':asyncio.run(main())
