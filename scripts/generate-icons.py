"""Fit the supplied club logo into app icons without cropping or distorting it."""
from pathlib import Path
from PIL import Image, ImageOps
from math import hypot

ROOT = Path(__file__).resolve().parent.parent
source = ImageOps.exif_transpose(Image.open(ROOT/'assets'/'brtm-logo.jpg')).convert('RGB')
folder=ROOT/'public'/'icons'
folder.mkdir(exist_ok=True)
for filename,size,maskable in [('brtm-brand-192.png',192,False),('brtm-brand-512.png',512,False),('brtm-brand-maskable-512.png',512,True)]:
    # Android's maskable safe zone is the central circle of radius 40% of the icon.
    scale = (size*0.8)/hypot(*source.size) if maskable else (size*0.97)/max(source.size)
    target = (max(1,int(source.width*scale)),max(1,int(source.height*scale)))
    logo = source.resize(target,Image.Resampling.LANCZOS)
    image = Image.new('RGB',(size,size),'#000b19')
    image.paste(logo,((size-logo.width)//2,(size-logo.height)//2))
    image.save(folder/filename,optimize=True)
