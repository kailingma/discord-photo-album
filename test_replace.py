import asyncio, tempfile, json
from pathlib import Path
from types import SimpleNamespace as NS
from datetime import datetime,timezone
from archiver import Config,Archiver
from bridge import PhotoBot,BridgeStore
class API:
    url='https://album.example';pending=None
    def __init__(self):self.rows=[];self.uploads=0
    async def put(self,k,d,c):self.pending=(d,c)
    async def call(self,method,path,**kw):
        if path=='/internal/records':
            if method=='GET':return self.rows.copy()
            r=dict(kw['json']);self.rows=[x for x in self.rows if x['id']!=r['id']]+[r];return {'ok':True}
        if method=='PUT':self.uploads+=int(path.startswith('/internal/media/')); return {'ok':True}
class Att:
    id=2;filename='a.png';content_type='image/png';size=3
    async def read(self):
        import io
        from PIL import Image
        out=io.BytesIO();Image.new('RGB',(16,16),'red').save(out,'PNG');return out.getvalue()
async def test():
    with tempfile.TemporaryDirectory() as d:
        p=Path(d);(p/'cfg.json').write_text(json.dumps({'channels':[10],'replace_messages':True,'introduce_channels':True}));cfg=Config(p/'cfg.json');api=API();arch=Archiver(cfg,BridgeStore(),p/'photos',api);bot=PhotoBot(cfg,arch,api)
        bot._connection.user=NS(id=7)
        async def introduce(ch):return {'token':'T'}
        bot.introduce=introduce
        events=[]
        class Hook:
            name='Photo archive';user=NS(id=7)
            fail=False
            async def send(self,text,**kw):
                assert '[(View Gallery)](https://album.example/photo/' in text and '?token=T)' in text
                assert kw['username']=='Kai' and kw['avatar_url']=='https://example.com/avatar.png'
                assert kw['suppress_embeds'] and not kw['allowed_mentions'].everyone
                if self.fail:raise RuntimeError('network')
                events.append('repost');return NS(id=100)
        hook=Hook()
        class Channel:
            id=10;name='album'
            async def webhooks(self):return [hook]
        class Message:
            id=1;guild=NS(id=1);channel=Channel();attachments=[Att()];stickers=[];content='caption';created_at=datetime.now(timezone.utc);jump_url='https://discord.com/channels/1/10/1';author=NS(id=4,display_name='Kai',display_avatar=NS(url='https://example.com/avatar.png'))
            async def delete(self):events.append('delete')
        m=Message();await bot.replace(m);assert events==['repost','delete'];assert api.uploads==1
        await bot.replace(m);assert events==['repost','delete','delete'];assert api.uploads==1
        m.id=9;hook.fail=True
        try:await bot.replace(m)
        except RuntimeError:pass
        assert events[-1]=='delete' and len(events)==3
        hook.fail=False
        try:await bot.replace(m)
        except RuntimeError as e:assert 'reconciliation' in str(e)
        else:raise AssertionError('uncertain send was retried')
        await bot.close()
    print('Replacement success, duplicate, failure and crash-window tests passed')
asyncio.run(test())
