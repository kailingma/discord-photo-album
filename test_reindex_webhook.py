import asyncio,json,tempfile
from datetime import datetime,timezone
from pathlib import Path
from types import SimpleNamespace as NS
from unittest.mock import patch
from archiver import Config,Archiver
from bridge import PhotoBot,BridgeStore
from test_replace import API,Att
async def async_value(x):return x
class JobAPI(API):
    def __init__(self):super().__init__();self.jobs={}
    async def call(self,method,path,**kw):
        if path=='/internal/reindex' and method=='GET':return list(self.jobs.values())
        if path.startswith('/internal/reindex/'):
            jid=path.rsplit('/',1)[-1]
            if method=='GET':return self.jobs.get(jid)
            if method=='PATCH':self.jobs[jid]=dict(kw['json']);return {'ok':True}
        return await super().call(method,path,**kw)
async def test():
    with tempfile.TemporaryDirectory() as d:
        p=Path(d);(p/'cfg.json').write_text(json.dumps({'channels':[10]}));cfg=Config(p/'cfg.json');api=JobAPI();api.channel=lambda *a:async_value({'token':'T'})
        bot=PhotoBot(cfg,Archiver(cfg,BridgeStore(),p/'photos',api),api);bot._connection.user=NS(id=7)
        class Channel:
            id=10;name='album';guild=NS(id=1,me=NS(id=7))
            def permissions_for(self,m):return NS(view_channel=True,read_message_history=True)
            async def history(self,limit=None,oldest_first=True,after=None):
                for m in self.messages:yield m
        ch=Channel()
        def mk(i,author,webhook_id):
            return NS(id=i,guild=ch.guild,channel=ch,attachments=[Att()],content='c',created_at=datetime.now(timezone.utc),jump_url='https://discord.com/channels/1/10/'+str(i),author=author,webhook_id=webhook_id,message_snapshots=[])
        human=mk(1,NS(id=4,display_name='Kai',bot=False),None)
        repost=mk(2,NS(id=55,display_name='Kai',bot=True),55)  # webhook repost: author carries the webhook id, not the bot user id
        otherbot=mk(3,NS(id=88,display_name='SomeBot',bot=True),None)
        ch.messages=[human,repost,otherbot]
        bot.get_channel=lambda id:ch
        with patch('bridge.discord.TextChannel',Channel):
            job={'id':'j1','guild_id':'1','channel_id':'10','requested_by':'4','status':'queued','scanned':0,'saved':0,'unresolved':0}
            api.jobs['j1']=dict(job)
            await bot.run_reindex(job)
        report=api.jobs['j1']
        assert report['status']=='completed',report
        assert report['scanned']==3,report  # all messages checkpointed
        assert report['saved']==1,report    # only the human original archived
        assert api.uploads==1 and len(api.rows)==1 and api.rows[0]['message_id']=='1'
        await bot.close()
    print('Reindex skips webhook reposts and bot posts; human originals archive; no duplicate repost records')
asyncio.run(test())
