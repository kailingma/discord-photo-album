"""Bounded archive cleanup. Full-resolution image pixels/audio/video are not transcoded."""
import io,json,os,re,subprocess,tempfile,warnings
from pathlib import Path
from PIL import Image,ImageOps
from strip_metadata import strip_image
MAX_BYTES=25000000
BOMB_PIXELS=100000000  # decompression-bomb guard only; modern phones exceed 16 MP
Image.MAX_IMAGE_PIXELS=BOMB_PIXELS

def process_image(data,preview=True):
    if len(data)>MAX_BYTES:raise ValueError('Media over 25 MB safety limit')
    with warnings.catch_warnings():
        warnings.simplefilter('error',Image.DecompressionBombWarning)
        with Image.open(io.BytesIO(data)) as img:
            orientation=int(img.getexif().get(274,1));date=img.getexif().get(36867) or img.getexif().get(306)
            # Orientation is a structural display instruction, not identifying metadata.
            if img.format=='PNG' and orientation!=1:raise ValueError('Oriented PNG needs lossless-rotation support')
            clean,mime=strip_image(data)
            if mime=='image/jpeg' and orientation!=1:
                ex=Image.Exif();ex[274]=orientation;raw=ex.tobytes();segment=b'\xff\xe1'+(len(raw)+2).to_bytes(2,'big')+raw;clean=clean[:2]+segment+clean[2:]
            elif mime=='image/webp' and orientation!=1:raise ValueError('Oriented WebP needs lossless-rotation support')
            thumb=None
            if preview:
                # Preview is optional; a huge source must not fail the archive.
                try:
                    if img.format=='JPEG':img.draft('RGB',(960,960))
                    img.thumbnail((960,960));small=ImageOps.exif_transpose(img).convert('RGBA' if img.mode=='RGBA' else 'RGB');small.info.clear();out=io.BytesIO();small.save(out,'WEBP',quality=78,method=2);thumb=out.getvalue();small.close()
                except (MemoryError,ValueError,OSError):thumb=None
            return {'data':clean,'mime':mime,'preview':thumb,'capture_date':str(date)[:30] if date else None,'orientation':orientation,'metadata_clean':True}

def process_video(data,suffix):
    if len(data)>MAX_BYTES:raise ValueError('Media over 25 MB safety limit')
    if suffix.lower() not in ['.mp4','.mov','.m4v','.webm','.mkv']:raise ValueError('Video container sanitizer unsupported')
    with tempfile.TemporaryDirectory() as d:
        source=Path(d)/('source'+suffix);target=Path(d)/('clean'+suffix);source.write_bytes(data)
        cmd=['ffmpeg','-max_alloc','33554432','-nostdin','-v','error','-threads','1','-i',str(source),'-map','0:v:0','-map','0:a?','-c','copy','-map_metadata','-1','-map_metadata:s','-1','-map_chapters','-1','-metadata','encoder=','-metadata:s','encoder=','-metadata:s','handler_name=','-metadata:s','language=und','-y',str(target)]
        subprocess.run(cmd,check=True,timeout=60,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
        info=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_entries','format_tags:stream_tags','-of','json',str(target)],timeout=15))
        safe={'encoder','duration','handler_name','vendor_id','language','major_brand','minor_version','compatible_brands'}
        for obj in [info.get('format',{}),*info.get('streams',[])]:
            if set(k.lower() for k in obj.get('tags',{}))-safe:raise ValueError('Metadata verification failed')
            for key,value in obj.get('tags',{}).items():
                key=key.lower()
                if key=='encoder' and not re.fullmatch(r'Lavf[0-9.]+',value):raise ValueError('Unknown encoder metadata')
                if key=='handler_name' and value not in ('VideoHandler','SoundHandler',''):raise ValueError('Unknown handler metadata')
                if key=='language' and value!='und':raise ValueError('Unknown language metadata')
                if key=='duration' and not re.fullmatch(r'[0-9:.]+',value):raise ValueError('Unknown duration metadata')
                if key=='vendor_id' and value not in ('[0][0][0][0]',''):raise ValueError('Unknown vendor metadata')
        result=target.read_bytes()
        if len(result)>MAX_BYTES:raise ValueError('Clean video over safety limit')
        return {'data':result,'mime':{'.mp4':'video/mp4','.m4v':'video/mp4','.mov':'video/quicktime','.webm':'video/webm','.mkv':'video/x-matroska'}[suffix.lower()],'preview':None,'metadata_clean':True}

def process(data,filename,kind,preview=True):
    return process_video(data,os.path.splitext(filename)[1]) if kind=='video' else process_image(data,preview)
if __name__=='__main__':
    import sys,resource
    source,target,filename,kind,preview=sys.argv[1:]
    if kind!='video':resource.setrlimit(resource.RLIMIT_AS,(180*1024*1024,180*1024*1024))
    result=process(Path(source).read_bytes(),filename,kind,preview=='yes');Path(target).write_bytes(result.pop('data'));thumb=result.pop('preview',None)
    if thumb:Path(target+'.preview').write_bytes(thumb)
    Path(target+'.json').write_text(json.dumps(result))

