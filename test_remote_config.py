import asyncio,json,os,tempfile
from pathlib import Path
from types import SimpleNamespace as NS
from archiver import Config,Archiver
from bridge import PhotoBot,BridgeStore
class API:
    fail=False
    async def call(self,*a,**kw):
        if self.fail:raise RuntimeError('offline')
        return {'servers':[{'guild_id':'1','channels':['10'],'naming':'caption','replace_messages':False,'role_policy':{'viewer':[],'moderator':[],'admin':[]}}]}
async def test():
    with tempfile.TemporaryDirectory() as d:
        p=Path(d);f=p/'config.json';f.write_text(json.dumps({'channels':[],'replace_messages':False}));cfg=Config(f);api=API();arch=Archiver(cfg,BridgeStore(),p/'photos',api);bot=PhotoBot(cfg,arch,api)
        os.environ['REMOTE_CONFIG']='yes';await bot.refresh_remote();assert bot.server_config(1)['channels']==[10];assert bot.server_config(2) is None
        assert cfg['channels']==[]
        called=[]
        async def replace(m):called.append(m)
        bot.replace=replace
        bot.archive_only=replace
        await bot.on_message(NS(author=NS(bot=False),webhook_id=None,guild=NS(id=1),channel=NS(id=10)))
        assert len(called)==1
        api.fail=True;await bot.refresh_remote();assert bot.server_config(1) is None
        await bot.close();os.environ.pop('REMOTE_CONFIG')
    print('Remote config server isolation, local-config preservation, disabled-replacement and fail-closed tests passed')
asyncio.run(test())
