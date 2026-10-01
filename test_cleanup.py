import asyncio,json,tempfile,io
from pathlib import Path
from types import SimpleNamespace as NS
from PIL import Image
from archiver import Config,Archiver
from bridge import PhotoBot,BridgeStore
class Response:
 status=200
 def __init__(self,data):self.data=data
 async def __aenter__(self):return self
 async def __aexit__(self,*a):pass
 async def read(self):return self.data
class API:
 url='http://localhost';headers={}
 def __init__(self,record,data):self.records=[record];self.data=data;self.job={'id':'test','guild_id':'1','requested_by':'5','status':'queued'};self.media=[];self.effects=[];self.fail=False;self.session=NS(get=lambda *a,**k:Response(self.data))
 async def call(self,method,path,**kw):
  self.effects.append((method,path))
  if path=='/internal/records':return self.records
  if path=='/internal/cleanup/test':
   if method=='PATCH':self.job.update(kw['json']);return {'ok':True}
   return self.job
  if method=='PUT':
   if self.fail:raise RuntimeError('upload unavailable')
   self.media.append((path,kw['data']));return {'ok':True}
  if method=='PATCH' and path.startswith('/internal/records/'):self.records[0]=kw['json'];return {'ok':True}
async def test():
 with tempfile.TemporaryDirectory() as d:
  cfgfile=Path(d)/'config.json';cfgfile.write_text(json.dumps({'data_dir':d,'channels':[10]}));cfg=Config(cfgfile)
  im=Image.new('RGB',(64,32),'red');out=io.BytesIO();ex=Image.Exif();ex[315]='Private author';im.save(out,'JPEG',exif=ex)
  record={'id':'a'*32,'guild_id':'1','channel_id':'10','original':'a.jpg'};api=API(record,out.getvalue());bot=PhotoBot(cfg,Archiver(cfg,BridgeStore(),Path(d),api),api);bot.server_config=lambda id:cfg
  await bot.run_cleanup(dict(api.job));assert api.job['status']=='completed' and api.job['cleaned']==1;assert api.records[0]['metadata_clean'] and api.records[0]['has_preview'];assert b'Private author' not in api.media[0][1]
  assert not any('reindex' in p or 'discord' in p for _,p in api.effects)
  api2=API({'id':'a'*32,'guild_id':'1','channel_id':'10','original':'a.jpg'},b'bad-data');bot.api=api2;await bot.run_cleanup(dict(api2.job));assert api2.job['failed']==1 and not api2.media and not api2.records[0].get('metadata_clean')
  api3=API({'id':'a'*32,'guild_id':'1','channel_id':'10','original':'a.jpg'},out.getvalue());api3.fail=True;bot.api=api3;await bot.run_cleanup(dict(api3.job));assert api3.job['failed']==1 and not api3.records[0].get('metadata_clean')
  await bot.close()
 print('Manual cleanup sanitizes/previews, never reads history or writes Discord; invalid files/upload failures leave records unchanged')
asyncio.run(test())
