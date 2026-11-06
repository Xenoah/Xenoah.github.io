#!/usr/bin/env python3
"""Import the reviewed public-only diary export. No network or private repo reads."""
from __future__ import annotations
import argparse, hashlib, html, io, json, os, re, shutil, tempfile
from datetime import date
from pathlib import Path
from markdown_it import MarkdownIt
from PIL import Image, ImageOps

HEX=re.compile(r'[0-9a-f]{64}\Z')
SOURCE=re.compile(r'https://x\.com/shuminchuuu/status/([0-9]{1,19})\Z')
EMBED=re.compile(r'\{\{X_EMBED:([0-9]{1,19})\}\}')
NOTE=re.compile(r'https://note\.com/xenoah_memo/n/n[0-9a-f]{12}\Z')
START='2026-11-03'
class ImportError(ValueError): pass

def digest(raw): return hashlib.sha256(raw).hexdigest()
def check(condition, message):
    if not condition: raise ImportError(message)
def label(value,n): return isinstance(value,str) and 0<len(value)<=n and value==value.strip() and not any(ord(c)<32 for c in value)
def read(path,limit):
    check(not path.is_symlink() and path.is_file() and path.stat().st_size<=limit,'Invalid bounded input file')
    return path.read_bytes()
def urls(day): return 'blog/articles/'+day+'-diary','/blog/'+day.replace('-','/')+'/diary/'
def load_manifest(root):
    p=root/'blog/pages-first.json'
    if not p.exists(): return {'schema_version':1,'articles':[]}
    value=json.loads(read(p,2_000_000))
    check(set(value)=={'schema_version','articles'} and value['schema_version']==1 and isinstance(value['articles'],list),'Invalid Pages manifest')
    seen=set()
    for e in value['articles']:
        check(isinstance(e,dict) and set(e)=={'date_jst','title','article_digest','path','permalink','content_sha256','source_urls','note_url','images'},'Unexpected Pages entry fields')
        day=e.get('date_jst',''); validate_day(day); path,permalink=urls(day)
        check(label(e['title'],120) and e['title'].startswith(day),'Invalid Pages title')
        sources=e['source_urls'];check(isinstance(sources,list) and 1<=len(sources)<=20 and all(isinstance(u,str) and SOURCE.fullmatch(u) for u in sources) and len(set(sources))==len(sources),'Invalid Pages sources')
        images=e['images'];check(isinstance(images,list) and len(images)==1,'Invalid Pages image list')
        i=images[0];check(isinstance(i,dict) and set(i)=={'file','bytes','source_bytes','width','height'} and re.fullmatch(r'[0-9a-f]{20}\.webp',i['file']) and all(type(i[k]) is int and i[k]>0 for k in ('bytes','source_bytes','width','height')) and i['bytes']<=256000 and max(i['width'],i['height'])<=1280,'Invalid Pages image')
        check(day not in seen and e.get('path')==path and e.get('permalink')==permalink and HEX.fullmatch(e.get('article_digest','')) and HEX.fullmatch(e.get('content_sha256','')),'Invalid Pages identity')
        check(e.get('note_url') is None or NOTE.fullmatch(e['note_url']),'Invalid linked note URL')
        seen.add(day)
    return value

def validate_day(day):
    check(isinstance(day,str) and re.fullmatch(r'\d{4}-\d{2}-\d{2}',day) and day>=START,'Invalid Pages-first date')
    date.fromisoformat(day)

def load_bundle(folder,expected_sha):
    check(not folder.is_symlink() and folder.is_dir(),'Invalid export directory')
    raw_bundle=read(folder/'bundle.json',160_000)
    check(isinstance(expected_sha,str) and HEX.fullmatch(expected_sha) and digest(raw_bundle)==expected_sha,'Public bundle digest mismatch')
    value=json.loads(raw_bundle)
    check(isinstance(value,dict) and set(value)=={'schema_version','date_jst','title','tags','body_markdown','source_urls','cover','article_digest'} and value['schema_version']==1,'Unexpected public export fields')
    validate_day(value['date_jst'])
    check(label(value['title'],120) and value['title'].startswith(value['date_jst']),'Invalid date title')
    check(HEX.fullmatch(value['article_digest'] or ''),'Invalid reviewed digest')
    tags=value['tags'];check(isinstance(tags,list) and 0<len(tags)<=10 and all(label(t,30) for t in tags) and len(set(tags))==len(tags),'Invalid tags')
    sources=value['source_urls'];check(isinstance(sources,list) and 1<=len(sources)<=20 and all(isinstance(u,str) and SOURCE.fullmatch(u) for u in sources) and len(set(sources))==len(sources),'Invalid own sources')
    body=value['body_markdown'];check(isinstance(body,str) and 0<len(body.encode())<=100_000,'Invalid prose size')
    check(EMBED.findall(body)==[SOURCE.fullmatch(u).group(1) for u in sources] and '{{X_EMBED:' not in EMBED.sub('',body),'Source order mismatch')
    check(not re.search(r'(?m)^\s*>|!\[|<\s*(?:script|iframe|img|blockquote|svg)\b|https?://(?:www\.)?(?:x\.com|twitter\.com|t\.co|pbs\.twimg\.com)/',body,re.I),'Unexpected source content')
    cover=value['cover'];check(isinstance(cover,dict) and set(cover)=={'path','alt','sha256'} and cover['path'] in {'cover.png','cover.jpg','cover.webp'} and label(cover['alt'],200) and HEX.fullmatch(cover['sha256'] or ''),'Invalid own cover')
    check({p.name for p in folder.iterdir()}=={'bundle.json',cover['path']},'Extra files refused')
    raw=read(folder/cover['path'],12_000_000);check(digest(raw)==cover['sha256'],'Cover digest mismatch')
    return value,raw

def compress(raw):
    Image.MAX_IMAGE_PIXELS=32_000_000
    with Image.open(io.BytesIO(raw)) as original:
        check(original.format in {'PNG','JPEG','WEBP'},'Invalid cover image')
        n=getattr(original,'n_frames',1)
        check(1<=n<=24,'Invalid cover image')
        frames=[];durations=[]
        for i in range(n):
            original.seek(i)
            frame=ImageOps.exif_transpose(original.convert('RGB'))
            frame.thumbnail((1280,1280),Image.Resampling.LANCZOS)
            frames.append(frame)
            durations.append(original.info.get('duration',500) or 500)
        check(all(f.size==frames[0].size for f in frames),'Invalid cover image')
        for quality in (80,70,60,50):
            out=io.BytesIO();frames[0].save(out,format='WEBP',quality=quality,method=6,save_all=True,append_images=frames[1:],duration=durations,loop=0);encoded=out.getvalue()
            if len(encoded)<=256_000: break
        check(len(encoded)<=256_000,'Cover exceeds public byte budget')
        return encoded,frames[0].size

def render(bundle,asset,width,height,note_url=None):
    day=bundle['date_jst'];path,permalink=urls(day)
    md=MarkdownIt('commonmark',{'html':False,'linkify':False})
    parts=[]
    for fragment in re.split(r'(\{\{X_EMBED:[0-9]{1,19}\}\})',bundle['body_markdown']):
        match=EMBED.fullmatch(fragment)
        if match:
            parts.append('<blockquote class="twitter-tweet" data-dnt="true" data-cards="hidden" data-conversation="none"><a href="https://x.com/shuminchuuu/status/'+match.group(1)+'">Xで出典を読む</a></blockquote>')
        else: parts.append(md.render(fragment))
    body='\n'.join(parts).replace('<h1>','<h2>').replace('</h1>','</h2>')
    body=body.replace('{','&#123;').replace('}','&#125;')
    meta={'layout':'post','blog_article':True,'title':bundle['title'],'date':day,'description':'本人の公開投稿をもとにAI助手が執筆する独立した日記。','permalink':permalink,'canonical_url':'https://xenoah.github.io'+permalink,'author':'AI助手','tags':bundle['tags'],'diary_date':day,'diary_digest':bundle['article_digest'],'has_x_embeds':True,'image':'/'+path+'/'+asset,'image_width':width,'image_height':height,'image_alt':bundle['cover']['alt']}
    front='---\n'+'\n'.join(k+': '+(v if k in {'layout','date'} else json.dumps(v,ensure_ascii=False)) for k,v in meta.items())+'\n---\n'
    link=f'<a href="{html.escape(note_url,quote=True)}">note版を読む</a>' if note_url else 'note版は後日掲載予定です。'
    return front+'<p class="source-note">AI助手による独立した日記です。本人の代筆ではありません。'+link+'</p>\n'+body+'\n'

def safe_target(root,path):
    target=root/path
    for p in (root/'blog',root/'blog/articles',target,root/'blog/pages-first.json'):
        check(not p.is_symlink(),'Unsafe output path')
    return target

def install(root,entry,text,manifest,asset_bytes=None):
    target=safe_target(root,entry['path']);mp=root/'blog/pages-first.json'
    target.parent.mkdir(parents=True,exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.diary-',dir=root/'blog') as temp:
        temp=Path(temp);stage=temp/'article';backup=temp/'previous';new_manifest=temp/'manifest.json'
        if target.exists():
            check(target.is_dir() and all(p.is_file() and not p.is_symlink() for p in target.iterdir()),'Unexpected article directory')
            shutil.copytree(target,stage)
        else:stage.mkdir()
        (stage/'index.html').write_text(text,encoding='utf-8')
        if asset_bytes is not None:(stage/entry['images'][0]['file']).write_bytes(asset_bytes)
        new_manifest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        existed=target.exists()
        if existed:os.replace(target,backup)
        try:
            os.replace(stage,target);os.replace(new_manifest,mp)
        except BaseException:
            if target.exists():shutil.rmtree(target)
            if existed:os.replace(backup,target)
            raise

def import_bundle(root,folder,expected_sha):
    bundle,raw=load_bundle(folder,expected_sha);day=bundle['date_jst'];manifest=load_manifest(root)
    old=next((e for e in manifest['articles'] if e['date_jst']==day),None)
    check(old is None or old['article_digest']==bundle['article_digest'],'Published date is immutable; use reviewed revision procedure')
    path,permalink=urls(day);target=root/path
    check(not (root/'blog').is_symlink() and not (root/'blog/articles').is_symlink() and not target.is_symlink(),'Unsafe output path')
    check(old is not None or not target.exists(),'Unmanaged article collision')
    encoded,(width,height)=compress(raw);asset=digest(encoded)[:20]+'.webp'
    text=render(bundle,asset,width,height,old['note_url'] if old else None)
    entry={'date_jst':day,'title':bundle['title'],'article_digest':bundle['article_digest'],'path':path,'permalink':permalink,'content_sha256':digest(text.encode()),'source_urls':bundle['source_urls'],'note_url':old['note_url'] if old else None,'images':[{'file':asset,'bytes':len(encoded),'source_bytes':len(raw),'width':width,'height':height}]}
    if old:
        check(old==entry and read(target/'index.html',160_000)==text.encode() and read(target/asset,256_000)==encoded,'Existing publication differs; no overwrite')
        return entry
    manifest['articles'].append(entry);manifest['articles'].sort(key=lambda e:e['date_jst'])
    install(root,entry,text,manifest,encoded)
    return entry

def link_note(root,day,note_url,article_digest):
    validate_day(day);check(NOTE.fullmatch(note_url),'Invalid note URL')
    manifest=load_manifest(root);entry=next((e for e in manifest['articles'] if e['date_jst']==day),None)
    check(entry is not None and entry['article_digest']==article_digest,'Unknown publication or digest')
    check(entry['note_url'] in (None,note_url),'Note already linked elsewhere')
    check(not any(e['date_jst']!=day and e['note_url']==note_url for e in manifest['articles']),'Duplicate note linkage')
    if entry['note_url']==note_url:return entry
    target=safe_target(root,entry['path'])/'index.html';raw=read(target,160_000);check(digest(raw)==entry['content_sha256'],'Published body changed')
    text=raw.decode();check(text.count('note版は後日掲載予定です。')==1,'Unexpected pending marker')
    text=text.replace('note版は後日掲載予定です。',f'<a href="{note_url}">note版を読む</a>',1)
    entry['note_url']=note_url;entry['content_sha256']=digest(text.encode());install(root,entry,text,manifest);return entry

def validate_repository(root):
    manifest=load_manifest(root)
    for entry in manifest['articles']:
        target=safe_target(root,entry['path']);text=read(target/'index.html',160_000)
        check(digest(text)==entry['content_sha256'],'Pages content hash mismatch')
        image=entry['images'][0];raw=read(target/image['file'],256_000)
        check(len(raw)==image['bytes'] and digest(raw).startswith(image['file'][:20]),'Pages image hash mismatch')
        with Image.open(io.BytesIO(raw)) as im:check(im.size==(image['width'],image['height']),'Pages image dimensions mismatch')
    return manifest

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);sub=parser.add_subparsers(dest='command',required=True)
    imp=sub.add_parser('import');imp.add_argument('--bundle',type=Path,required=True);imp.add_argument('--bundle-sha256',required=True)
    link=sub.add_parser('link-note');link.add_argument('--date',required=True);link.add_argument('--note-url',required=True);link.add_argument('--article-digest',required=True);link.add_argument('--publication-verified',action='store_true',required=True)
    sub.add_parser('validate')
    args=parser.parse_args()
    try:
        if args.command=='validate':
            result=validate_repository(args.root.resolve());print(json.dumps({'pages_articles':len(result['articles'])}));return
        result=import_bundle(args.root.resolve(),args.bundle,args.bundle_sha256) if args.command=='import' else link_note(args.root.resolve(),args.date,args.note_url,args.article_digest)
        print(json.dumps({'date_jst':result['date_jst'],'permalink':result['permalink'],'content_sha256':result['content_sha256'],'note_linked':result['note_url'] is not None}))
    except Exception as exc:
        print('diary import stopped: '+(str(exc) if isinstance(exc,ImportError) else type(exc).__name__));raise SystemExit(1)
if __name__=='__main__':main()
