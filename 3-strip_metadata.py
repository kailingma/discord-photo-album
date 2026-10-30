"""Lossless image-container metadata stripping. Pixel data is never re-encoded."""
import struct,zlib

ICC_TEXT_TAGS={b'desc',b'cprt',b'dmnd',b'dmdd',b'vued'}
def scrub_icc(data):
    # ICC profiles carry colour interpretation (kept) plus free-text description,
    # copyright and device make/model strings (can identify a person or studio).
    # Zero the textual tag payloads in place - same length, offsets stay valid -
    # and fail closed on a malformed table rather than trusting it.
    if len(data)<132:raise ValueError('Truncated colour profile')
    n=int.from_bytes(data[128:132],'big')
    if n>200 or 132+12*n>len(data):raise ValueError('Invalid colour profile tag table')
    out=bytearray(data)
    for i in range(n):
        e=132+12*i;sig=data[e:e+4];off=int.from_bytes(data[e+4:e+8],'big');size=int.from_bytes(data[e+8:e+12],'big')
        if off<132+12*n or off+size>len(data):raise ValueError('Invalid colour profile tag offset')
        if sig in ICC_TEXT_TAGS:out[off:off+size]=b'\0'*size
    return bytes(out)

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
        # ICC profiles are colour interpretation, not identifying metadata: keep the
        # colour data (scrubbed of its free-text tags) so wide-gamut photos keep their colours.
        if code==0xe2 and data[p+2:end].startswith(b'ICC_PROFILE'):
            payload=data[p+2:end]
            if len(payload)<14 or payload[12]!=1 or payload[13]!=1:raise ValueError('Multi-part colour profile needs verified sanitizer')
            out.extend(data[start:p+2]+payload[:14]+scrub_icc(payload[14:]));p=end;continue
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
        if kind==b'iCCP':
            # Keep the colour profile, scrubbed of its text tags; drop the free-form profile name.
            name,sep,rest=data[p+8:p+8+n].partition(b'\0')
            if not sep or not rest or rest[0]!=0:raise ValueError('Invalid iCCP colour chunk')
            scrubbed=zlib.compress(scrub_icc(zlib.decompress(rest[1:])))
            body=b'iCCP'+b'ICC\0\x00'+scrubbed
            out.extend((len(body)-4).to_bytes(4,'big')+body+zlib.crc32(body).to_bytes(4,'big'))
            p=end;continue
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
        if kind==b'ICCP':
            chunk=bytearray(data[p:end]);chunk[8:8+n]=scrub_icc(bytes(chunk[8:8+n]))
            chunks.append(bytes(chunk));p=end;continue
        if kind in safe:
            chunk=bytearray(data[p:end])
            if kind==b'VP8X':
                if n!=10:raise ValueError('Invalid WebP feature header')
                chunk[8]&=~(0x08|0x04) # EXIF, XMP (ICC bit kept with its chunk)
            chunks.append(bytes(chunk))
        p=end
    payload=b'WEBP'+b''.join(chunks);return b'RIFF'+len(payload).to_bytes(4,'little')+payload

def strip_image(data):
    if data.startswith(b'\xff\xd8'):return strip_jpeg(data),'image/jpeg'
    if data.startswith(b'\x89PNG'):return strip_png(data),'image/png'
    if data.startswith(b'RIFF'):return strip_webp(data),'image/webp'
    if data[:6] in (b'GIF87a',b'GIF89a'):raise ValueError('GIF is not supported for verified metadata removal')
    if len(data)>12 and data[4:8]==b'ftyp' and data[8:12] in (b'heic',b'heix',b'hevc',b'hevx',b'heis',b'hevm',b'hevs',b'avif',b'avis',b'mif1'):raise ValueError('HEIC/AVIF is not supported for verified metadata removal')
    raise ValueError('Image format not supported for verified metadata removal')

