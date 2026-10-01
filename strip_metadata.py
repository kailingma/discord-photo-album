"""Lossless image-container metadata stripping. Pixel data is never re-encoded."""
import struct,zlib

def strip_jpeg(data):
    if not data.startswith(b'\xff\xd8'):raise ValueError('Not JPEG')
    out=bytearray(data[:2]);p=2;capture=None
    while p<len(data):
        start=p
        if data[p]!=255:raise ValueError('Invalid JPEG marker')
        while p<len(data) and data[p]==255:p+=1
        if p>=len(data):raise ValueError('Truncated JPEG')
        code=data[p];p+=1
        if code==0xda:
            if p+2>len(data):raise ValueError('Truncated JPEG scan')
            n=int.from_bytes(data[p:p+2],'big');end=p+n
            if n<2 or end>len(data):raise ValueError('Truncated JPEG scan')
            out.extend(data[start:end]);p=end;scan_start=p
            while p<len(data):
                if data[p]!=255:p+=1;continue
                marker=p;p+=1
                while p<len(data) and data[p]==255:p+=1
                if p>=len(data):raise ValueError('Truncated JPEG entropy')
                if data[p]==0 or 0xd0<=data[p]<=0xd7:p+=1;continue
                out.extend(data[scan_start:marker]);p=marker;break
            continue
        if code==0xd9:
            if p!=len(data):raise ValueError('Trailing JPEG payload')
            out.extend(data[start:p]);return bytes(out)
        if code in range(0xd0,0xd9) or code==1:out.extend(data[start:p]);continue
        if p+2>len(data):raise ValueError('Truncated JPEG segment')
        n=int.from_bytes(data[p:p+2],'big');end=p+n
        if n<2 or end>len(data):raise ValueError('Truncated JPEG segment')
        # All APP metadata and comments removed. APP14 affects CMYK interpretation:
        # fail closed rather than silently alter its colours.
        if code==0xe2 and data[p+2:end].startswith(b'ICC_PROFILE'):raise ValueError('ICC JPEG needs verified colour-profile sanitizer')
        if code==0xee:raise ValueError('Adobe colour segment needs verified sanitizer')
        if not(0xe0<=code<=0xef or code==0xfe):out.extend(data[start:end])
        p=end
    raise ValueError('JPEG missing scan')

def strip_png(data):
    if data[:8]!=b'\x89PNG\r\n\x1a\n':raise ValueError('Not PNG')
    out=bytearray(data[:8]);p=8
    safe={b'IHDR',b'PLTE',b'IDAT',b'IEND',b'tRNS',b'gAMA',b'cHRM',b'sRGB',b'sBIT',b'acTL',b'fcTL',b'fdAT'}
    while p<len(data):
        if p+12>len(data):raise ValueError('Truncated PNG')
        n=int.from_bytes(data[p:p+4],'big');kind=data[p+4:p+8];end=p+12+n
        if end>len(data):raise ValueError('Truncated PNG')
        raw=data[p+4:p+8+n]
        if zlib.crc32(raw)&0xffffffff!=int.from_bytes(data[p+8+n:end],'big'):raise ValueError('PNG checksum')
        if kind==b'iCCP':raise ValueError('ICC PNG needs verified colour-profile sanitizer')
        if kind in safe:out.extend(data[p:end])
        elif kind[:1].isupper():raise ValueError('Unknown critical PNG chunk')
        p=end
        if kind==b'IEND':
            if p!=len(data):raise ValueError('Trailing PNG bytes')
            return bytes(out)
    raise ValueError('PNG missing end')

def strip_webp(data):
    if data[:4]!=b'RIFF' or data[8:12]!=b'WEBP':raise ValueError('Not WebP')
    if int.from_bytes(data[4:8],'little')+8!=len(data):raise ValueError('WebP length')
    chunks=[];p=12;safe={b'VP8 ',b'VP8L',b'VP8X',b'ALPH',b'ANIM',b'ANMF'}
    while p<len(data):
        if p+8>len(data):raise ValueError('Truncated WebP')
        kind=data[p:p+4];n=int.from_bytes(data[p+4:p+8],'little');end=p+8+n+(n%2)
        if end>len(data):raise ValueError('Truncated WebP')
        if kind==b'ICCP':raise ValueError('ICC WebP needs verified colour-profile sanitizer')
        if kind in safe:
            chunk=bytearray(data[p:end])
            if kind==b'VP8X':
                if n!=10:raise ValueError('Invalid WebP feature header')
                chunk[8]&=~(0x20|0x08|0x04) # ICC, EXIF, XMP
            chunks.append(bytes(chunk))
        p=end
    payload=b'WEBP'+b''.join(chunks);return b'RIFF'+len(payload).to_bytes(4,'little')+payload

def strip_image(data):
    if data.startswith(b'\xff\xd8'):return strip_jpeg(data),'image/jpeg'
    if data.startswith(b'\x89PNG'):return strip_png(data),'image/png'
    if data.startswith(b'RIFF'):return strip_webp(data),'image/webp'
    raise ValueError('Image format not supported for verified metadata removal')
