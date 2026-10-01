import io,json,subprocess
from PIL import Image,PngImagePlugin
from media_processor import process_image,process_video
im=Image.new('RGB',(120,80),'purple');ex=Image.Exif();ex[271]='Secret camera';ex[315]='Private author';ex[306]='2026:09:30 10:00:00';ex[274]=6
b=io.BytesIO();im.save(b,'JPEG',exif=ex);original=b.getvalue();out=process_image(original);a=Image.open(io.BytesIO(original));clean=Image.open(io.BytesIO(out['data']));assert a.tobytes()==clean.tobytes();assert set(clean.getexif())=={274};assert out['capture_date']=='2026:09:30 10:00:00';assert Image.open(io.BytesIO(out['preview'])).getexif()=={};assert b'Secret' not in out['data']
import tempfile
from pathlib import Path
with tempfile.TemporaryDirectory() as d:
 path=Path(d)/'private.webm';subprocess.run(['ffmpeg','-nostdin','-v','error','-f','lavfi','-i','color=c=purple:s=64x64:d=0.1','-c:v','libvpx','-metadata','title=Private title','-metadata','artist=Private author','-y',str(path)],check=True);video=path.read_bytes()
result=process_video(video,'.webm');assert result['metadata_clean'];assert b'Private author' not in result['data'] and b'Private title' not in result['data']
print('Full quality/orientation, private metadata removal, preview and video remux tests passed')
