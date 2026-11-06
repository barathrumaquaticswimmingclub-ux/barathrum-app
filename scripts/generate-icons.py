"""Reproducible app wordmark icons; requires Pillow for local asset generation only."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf'
SCALE = 4
image = Image.new('RGB', (512*SCALE, 512*SCALE), '#092d40')
draw = ImageDraw.Draw(image)
font = ImageFont.truetype(FONT, 91*SCALE)
label = 'BRTM'
box = draw.textbbox((0,0), label, font=font)
x=(512*SCALE-(box[2]-box[0]))/2-box[0]
y=235*SCALE-(box[3]+box[1])/2
draw.text((x,y),label,font=font,fill='#ffffff',stroke_width=0)
for offset,color in [(0,'#9aefd2'),(31,'#2a9fa5')]:
    points=[]
    import math
    for n in range(129):
        px=110+n*(292/128)
        py=326+offset+9*math.sin((px-110)*math.pi/146)
        points.append((round(px*SCALE),round(py*SCALE)))
    draw.line(points,fill=color,width=9*SCALE,joint='curve')
folder=ROOT/'public'/'icons'
folder.mkdir(exist_ok=True)
for filename,size in [('brtm-192.png',192),('brtm-512.png',512),('brtm-maskable-512.png',512)]:
    image.resize((size,size),Image.Resampling.LANCZOS).save(folder/filename,optimize=True)
