import asyncio,json,tempfile
from datetime import datetime,timezone
from pathlib import Path
from types import SimpleNamespace as NS
from archiver import Config,Archiver
from bridge import PhotoBot,BridgeStore
from test_replace import API,Att
async def test():
 with tempfile.TemporaryDirectory() as d:
  p=Path(d);f=p/'cfg.json';f.write_text(json.dumps({'channels':[10],'replace_messages':False}));cfg=Config(f);api=API();api.channel=lambda *a:async_value({'token':'T'})
  bot=PhotoBot(cfg,Archiver(cfg,BridgeStore(),p/'photos',api),api);bot._connection.user=NS(id=7)
  ch=NS(id=10,name='archive',guild=NS(id=1))
  m=NS(id=1,guild=ch.guild,channel=ch,attachments=[Att()],content='caption',created_at=datetime.now(timezone.utc),jump_url='https://discord.com/channels/1/10/1',author=NS(id=4,display_name='Kai',bot=False),webhook_id=None,message_snapshots=[])
  saved,issues=await bot.archive_only(m);assert saved==1 and not issues and api.uploads==1
  saved,issues=await bot.archive_only(m);assert saved==0 and api.uploads==1
  assert api.rows[0]['source_kind']=='direct' and not api.rows[0].get('deleted') and not api.rows[0].get('repost_id')
  m.id=2;m.attachments=[];m.message_snapshots=[NS(content='forwarded caption',attachments=[Att()],created_at=m.created_at)]
  saved,issues=await bot.archive_only(m);assert saved==1 and api.rows[-1]['source_kind']=='forwarded_snapshot';assert api.rows[-1]['author_id']=='0'
  m.id=3;m.message_snapshots=[];m.content='https://discord.com/channels/2/10/99'
  saved,issues=await bot.archive_only(m);assert not saved and issues and api.uploads==2
  await bot.close()
 print('Archive-only no-write, duplicate, snapshot and cross-server limit tests passed')
async def async_value(x):return x
asyncio.run(test())
async def test_linked():
 from unittest.mock import patch
 with tempfile.TemporaryDirectory() as d:
  p=Path(d);f=p/'cfg.json';f.write_text(json.dumps({'channels':[10],'replace_messages':False}));cfg=Config(f);api=API();api.channel=lambda *a:async_value({'token':'T'})
  bot=PhotoBot(cfg,Archiver(cfg,BridgeStore(),p/'photos',api),api);bot._connection.user=NS(id=7)
  class Channel:
   def __init__(self,id):self.id=id;self.name='channel'+str(id);self.guild=NS(id=1,me=NS(id=7));self.messages={}
   def permissions_for(self,m):return NS(view_channel=True,read_message_history=True)
   async def fetch_message(self,id):return self.messages[id]
  root=Channel(10);source=Channel(11)
  original=NS(id=99,guild=source.guild,channel=source,attachments=[Att()],content='original',created_at=datetime.now(timezone.utc),jump_url='https://discord.com/channels/1/11/99',author=NS(id=4,display_name='Original'),message_snapshots=[])
  source.messages[99]=original
  m=NS(id=3,guild=root.guild,channel=root,attachments=[],content='https://discord.com/channels/1/11/99',created_at=original.created_at,jump_url='https://discord.com/channels/1/10/3',author=NS(id=5,display_name='Poster'),message_snapshots=[])
  bot.get_channel=lambda id:source if id==11 else root
  with patch('bridge.discord.TextChannel',Channel):
   saved,issues=await bot.archive_only(m);assert saved==1 and not issues
   record=api.rows[0];assert record['protected_source_channel_id']=='11' and record['source_message_id']=='99' and record['channel_id']=='10' and record['author']=='Original'
   saved,issues=await bot.archive_only(m);assert not saved and api.uploads==1
   # Accessible forwarded reference wins over its anonymous snapshot.
   m.id=8;m.content='';m.reference=NS(guild_id=1,channel_id=11,message_id=99)
   m.message_snapshots=[NS(content='snapshot',attachments=[Att()],created_at=original.created_at)]
   saved,issues=await bot.archive_only(m);assert saved==1 and not issues
   record=api.rows[-1];assert record['author']=='Original' and record['source_message_id']=='99' and record['source_jump_url']==original.jump_url
   original_id=record['id'];count=len(api.rows)
   saved,issues=await bot.archive_only(m,refresh_id=original_id);assert saved==1 and len(api.rows)==count and api.rows[-1]['id']==original_id
   source.messages.pop(99)
   async def unavailable(id):raise ValueError('Original not accessible')
   source.fetch_message=unavailable
   m.id=9;saved,issues=await bot.archive_only(m);assert saved==1 and issues and api.rows[-1]['author']=='Author Unknown' and api.rows[-1]['source_kind']=='forwarded_snapshot'
   m.message_snapshots=[];m.reference=None
   m.id=4;m.content='https://discord.com/channels/1/10/4';root.messages[4]=m
   saved,issues=await bot.archive_only(m);assert not saved and not issues
  await bot.close()
 print('Linked original provenance, private source restriction, duplicates and reference cycles tests passed')
asyncio.run(test_linked())
async def test_video():
 from archiver import is_video,is_media
 assert is_video('clip.mp4') and is_media('clip.webm') and not is_media('notes.txt')
 with tempfile.TemporaryDirectory() as d:
  p=Path(d);f=p/'cfg.json';f.write_text(json.dumps({'channels':[10],'replace_messages':False}));cfg=Config(f);api=API();api.channel=lambda *a:async_value({'token':'T'});bot=PhotoBot(cfg,Archiver(cfg,BridgeStore(),p/'photos',api),api)
  class Video(Att):
   filename='clip.webm';content_type=None
   async def read(self):return Path('/tmp/private-video.webm').read_bytes()
  ch=NS(id=10,name='archive',guild=NS(id=1));m=NS(id=8,guild=ch.guild,channel=ch,attachments=[Video()],content='clip',created_at=datetime.now(timezone.utc),jump_url='https://discord.com/channels/1/10/8',author=NS(id=4,display_name='Kai'),message_snapshots=[])
  saved,issues=await bot.archive_only(m);assert saved==1 and not issues and api.rows[0]['media_kind']=='video' and api.rows[0]['content_type']=='video/webm'
  m.id=9;m.attachments[0].size=25000001;saved,issues=await bot.archive_only(m);assert not saved and issues and api.uploads==1
  await bot.close()
 print('Video classification/MIME, archive-only and oversized-original retention tests passed')
asyncio.run(test_video())
