import io
from PIL import Image,PngImagePlugin
from strip_metadata import strip_image
im=Image.new('RGB',(101,61),'purple')
for fmt in ['JPEG','PNG','WEBP']:
    b=io.BytesIO();ex=Image.Exif();ex[271]='Secret camera';ex[315]='Private author';ex[306]='2026:09:30 10:00:00'
    opts={'exif':ex.tobytes()}
    if fmt=='PNG':meta=PngImagePlugin.PngInfo();meta.add_text('GPS','Secret location');opts['pnginfo']=meta
    im.save(b,fmt,**opts);original=b.getvalue();clean,mime=strip_image(original);a=Image.open(io.BytesIO(original));c=Image.open(io.BytesIO(clean));assert a.tobytes()==c.tobytes();assert a.size==c.size;assert not c.getexif();assert b'Secret' not in clean and b'Private' not in clean;assert len(clean)<len(original)
print('JPEG/PNG/WebP metadata removal preserves decoded pixels and strips EXIF/text tests passed')
