import urllib.request,json,sys,base64
port=sys.argv[1];base='http://localhost:'+port
headers={'Authorization':'Bearer dummy','Content-Type':'application/json'}
def call(path,obj):
    return json.load(urllib.request.urlopen(urllib.request.Request(base+path,data=json.dumps(obj).encode(),headers=headers)))
ch=call('/internal/channel/10',{'guild_id':'1','name':'reFila workshop','policy':{}})
open('/tmp/album-demo-token-'+port,'w').write(ch['token'])
# actual generated photo thumbnails, no external images or personal photos
from PIL import Image,ImageDraw
import io
for n,color in enumerate(['#8171be','#6d9b91','#bd9972']):
    id=('%032x'%(n+1));im=Image.new('RGB',(600,420),'#262331');d=ImageDraw.Draw(im);d.rounded_rectangle((125,60,475,355),radius=28,fill=color);d.ellipse((175,105,425,355),fill='#211d2b');d.ellipse((210,140,390,320),outline='#d0c9dd',width=12);d.rectangle((140,70,180,330),fill=color);b=io.BytesIO();im.save(b,format='PNG')
    urllib.request.urlopen(urllib.request.Request(base+'/internal/media/'+id,data=b.getvalue(),headers={'Authorization':'Bearer dummy','Content-Type':'image/png'},method='PUT')).read()
    call('/internal/records',{'id':id,'seq':n+1,'channel_id':10,'caption':['First recycled spool','Diameter test','Workshop batch'][n],'original':'spool.png','author':'Demo member','posted_at':'2026-09-29T22:00:00Z','message_id':n+1,'attachment_id':n+1})
