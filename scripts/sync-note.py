#!/usr/bin/env python3
"""Mirror only public, free xenoah_memo prose. Never call X or persist API responses."""
from __future__ import annotations
import argparse, hashlib, html, io, json, os, re, shutil, tempfile
from datetime import datetime
from zoneinfo import ZoneInfo
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.error import HTTPError
from bs4 import BeautifulSoup, Comment
from PIL import Image, ImageOps

ACCOUNT = 'xenoah_memo'
USER_ID = 15949638
KEY = re.compile(r'n[0-9a-f]{12}\Z')
X_URL = re.compile(r'https://(?:x\.com|twitter\.com)/shuminchuuu/status/([0-9]+)(?:\?[^\s]*)?\Z')
ALLOWED = {'p','br','h2','h3','h4','h5','h6','strong','b','em','i','u','s','del','ul','ol','li','blockquote','a','hr','pre','code','figure','figcaption','img','table','thead','tbody','tr','td','th'}
DROP = {'script','style','iframe','object','embed','form','input','button','svg','math','template','noscript'}
Image.MAX_IMAGE_PIXELS = 32_000_000

class SyncError(Exception): pass
class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        raise SyncError('Unexpected redirect; no credentials or alternate host followed')

def fetch(url, limit=8_000_000):
    p = urlparse(url)
    if p.scheme != 'https' or p.hostname not in {'note.com','assets.st-note.com','xenoah.github.io'} or p.username or p.password or p.port:
        raise SyncError('Unapproved fetch host')
    if p.hostname=='xenoah.github.io' and (p.path!='/blog/note-mirror.json' or p.query or p.fragment): raise SyncError('Only published mirror manifest may be fetched')
    req = Request(url, headers={'User-Agent':'XenoahBlogMirror/1.0 (+https://xenoah.github.io/blog/)'})
    with build_opener(NoRedirect()).open(req, timeout=30) as r:
        data = r.read(limit + 1)
        if len(data) > limit: raise SyncError('Response exceeds size limit')
        return data

def api(path):
    return json.loads(fetch('https://note.com/api/' + path))['data']

def inventory():
    keys, seen = [], set()
    total = None
    for page in range(1, 169):
        data = api(f'v2/creators/{ACCOUNT}/contents?kind=note&page={page}')
        if total is None: total = data['totalCount']
        if data['totalCount'] != total or not isinstance(total, int) or not 0 <= total <= 1000:
            raise SyncError('Inventory changed or exceeds limit; retry a later scheduled run')
        for item in data['contents']:
            key = item.get('key','')
            if not KEY.fullmatch(key) or key in seen: raise SyncError('Invalid or duplicate note identity')
            seen.add(key); keys.append(key)
        if data['isLastPage']:
            if len(keys) != total: raise SyncError('Incomplete public inventory')
            return keys
        if not data['contents']: raise SyncError('Incomplete public inventory page')
    raise SyncError('Inventory limit exceeded')

def safe_link(value):
    if not isinstance(value,str): return None
    p = urlparse(value)
    if p.scheme == 'https' and p.hostname and not p.username and not p.password and not any(ord(c)<32 for c in value): return value
    if value.startswith('#') and re.fullmatch(r'#[a-zA-Z0-9_-]+',value): return value
    return None

def jekyll_escape(value):
    # Remote prose must not be interpreted as Liquid, including whitespace-control syntax.
    return value.replace('{', '&#123;').replace('}', '&#125;')

class Images:
    def __init__(self, folder, public_path):
        self.folder, self.public_path = folder, public_path
        self.cache = {}; self.stats = []
    def add(self, url):
        if url in self.cache: return self.cache[url]
        p = urlparse(url)
        if p.scheme != 'https' or p.hostname != 'assets.st-note.com' or p.username or p.password or p.port:
            raise SyncError('Only article-owned note assets can be copied; external image rejected')
        if len(self.cache) >= 8: raise SyncError('Article image count exceeds review limit')
        raw = fetch(url, 12_000_000)
        if sum(i['source_bytes'] for i in self.stats)+len(raw) > 24_000_000: raise SyncError('Article image byte budget exceeded')
        with Image.open(io.BytesIO(raw)) as original:
            if getattr(original,'n_frames',1) != 1: raise SyncError('Animated image needs explicit review')
            if original.format not in {'PNG','JPEG','WEBP'}: raise SyncError('Unsupported article image')
            im = ImageOps.exif_transpose(original)
            im.thumbnail((1280,1280), Image.Resampling.LANCZOS)
            im = im.convert('RGBA' if 'A' in im.getbands() or 'transparency' in im.info else 'RGB')
            encoded = io.BytesIO(); im.save(encoded,format='WEBP',quality=80,method=6)
            output=encoded.getvalue(); suffix='webp'
            for quality in (70, 60, 50):
                if len(output) <= 256_000: break
                encoded=io.BytesIO(); im.save(encoded,format='WEBP',quality=quality,method=6); output=encoded.getvalue()
            if len(output)>256_000: raise SyncError('Compressed image exceeds 256KB budget')
            # A bounded lossless fallback avoids enlarging small originals.
            if len(output) >= len(raw) and max(original.size)<=1280:
                fallback=io.BytesIO()
                fmt='PNG' if 'A' in im.getbands() or original.format=='PNG' else 'JPEG'
                im.save(fallback,format=fmt,**({'optimize':True} if fmt=='PNG' else {'quality':85,'optimize':True}))
                if len(fallback.getvalue()) < len(output): output=fallback.getvalue(); suffix='png' if fmt=='PNG' else 'jpg'
            name=hashlib.sha256(output).hexdigest()[:20]+'.'+suffix
            (self.folder/name).write_bytes(output)
            result={'url':self.public_path+'/'+name,'width':im.width,'height':im.height}
        self.cache[url]=result
        self.stats.append({'file':name,'source_bytes':len(raw),'bytes':len(output),'width':im.width,'height':im.height})
        return result

def clean_body(body, images):
    if not isinstance(body,str) or not body.strip(): raise SyncError('Missing public article body')
    soup=BeautifulSoup(body,'html.parser')
    # Unexpected embed shapes must be reviewed, never unwrapped into stored prose.
    for tag in soup.find_all(True):
        suspicious = tag.has_attr('data-src') or any('embed' in k.lower() for k in tag.attrs) or any('tweet' in str(c).lower() or 'embed' in str(c).lower() for c in tag.get('class', []))
        recognized = (tag.name == 'figure' and (tag.has_attr('embedded-service') or tag.has_attr('data-src'))) or (tag.name == 'blockquote' and 'twitter-tweet' in tag.get('class', []))
        if suspicious and not recognized:
            raise SyncError('Unexpected embedded source markup; review required')
    # Dispose of embedded source text BEFORE any serialization, description, image or logging.
    for figure in list(soup.select('figure[embedded-service], figure[data-src]')):
        source=figure.get('data-src',''); match=X_URL.fullmatch(source)
        figure.clear(); figure.attrs={}
        if match:
            block=soup.new_tag('blockquote',attrs={'class':'twitter-tweet','data-dnt':'true','data-cards':'hidden','data-conversation':'none'})
            a=soup.new_tag('a',href='https://x.com/shuminchuuu/status/'+match.group(1));a.string='Xで出典を読む';block.append(a);figure.append(block)
        elif safe_link(source):
            a=soup.new_tag('a',href=source);a.string='参照リンクを開く';figure.append(a)
        else: raise SyncError('Unknown embedded reference; review required')
    # A changed note embed format must fail closed, not copy a tweet body.
    for block in soup.select('blockquote.twitter-tweet'):
        links=[a.get('href','') for a in block.find_all('a')]
        own=[X_URL.fullmatch(a) for a in links]; own=[a for a in own if a]
        if not own: raise SyncError('Unrecognized X embed')
        block.clear();a=soup.new_tag('a',href='https://x.com/shuminchuuu/status/'+own[-1].group(1));a.string='Xで出典を読む';block.append(a)
        block.attrs={'class':'twitter-tweet','data-dnt':'true','data-cards':'hidden','data-conversation':'none'}
    for tag in list(soup.find_all(True)):
        if tag.name is None: continue
        if tag.name in DROP: tag.decompose();continue
        if tag.name=='h1': tag.name='h2'
        if tag.name not in ALLOWED: tag.unwrap();continue
        attrs={}
        if tag.name=='a':
            link=safe_link(tag.get('href'))
            if link: attrs={'href':link,'rel':'noopener noreferrer'}
        if tag.name=='blockquote' and 'twitter-tweet' in tag.get('class',[]):
            attrs={'class':'twitter-tweet','data-dnt':'true','data-cards':'hidden','data-conversation':'none'}
        if tag.name=='img':
            asset=images.add(tag.get('src',''))
            attrs={'src':asset['url'],'width':str(asset['width']),'height':str(asset['height']),'alt':tag.get('alt',''),'loading':'lazy','decoding':'async'}
        if tag.get('id') and re.fullmatch(r'[a-zA-Z0-9_-]{1,100}',tag['id']): attrs['id']=tag['id']
        tag.attrs=attrs
    for c in soup.find_all(string=lambda t:isinstance(t,Comment)): c.extract()
    description=' '.join(soup.get_text(' ',strip=True).split())[:150]
    return jekyll_escape(str(soup)),description,len(soup.select('blockquote.twitter-tweet'))

def render(note, stage, pinned_date=None):
    key=note.get('key','')
    if not KEY.fullmatch(key): raise SyncError('Invalid note key')
    if note.get('user',{}).get('urlname')!=ACCOUNT or note.get('user',{}).get('id')!=USER_ID:
        raise SyncError('Wrong author')
    if note.get('status')!='published' or note.get('is_published') is not True or note.get('is_draft') is not False or note.get('price')!=0 or note.get('is_limited') or note.get('is_r18') or note.get('type')!='TextNote':
        raise SyncError('Only public free unrestricted text articles can be mirrored')
    title=note.get('name',''); when=datetime.fromisoformat(note['publish_at'])
    if when.utcoffset() is None: raise SyncError('Timezone required')
    date=when.astimezone(ZoneInfo('Asia/Tokyo')).date().isoformat()
    if not title or when.utcoffset() is None: raise SyncError('Missing title or publication time')
    if pinned_date:
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}',pinned_date): raise SyncError('Invalid pinned date')
        date=pinned_date
    slug='note-'+key; dirname=date+'-'+slug;folder=stage/dirname;folder.mkdir()
    images=Images(folder,'/blog/articles/'+dirname)
    body,description,embeds=clean_body(note['body'],images)
    cover=images.add(note['eyecatch']) if note.get('eyecatch') else None
    tags=[a['hashtag']['name'].lstrip('#') for a in note.get('hashtag_notes',[])]
    note_url=f'https://note.com/{ACCOUNT}/n/{key}'
    meta={'layout':'post','blog_article':True,'title':title,'date':date,'description':description,'permalink':f'/blog/{date.replace("-","/")}/{slug}/','author':'AI助手','note_source':note_url,'canonical_url':note_url,'note_key':key,'tags':tags}
    if cover: meta.update(image=cover['url'],image_width=cover['width'],image_height=cover['height'],image_alt=note.get('eyecatch_alt') or 'AI助手日記のカバー')
    front='---\n'+'\n'.join(k+': '+('post' if k=='layout' else json.dumps(v,ensure_ascii=False)) for k,v in meta.items())+'\n---\n'
    attribution=f'<p class="source-note">AI助手による独立した日記です。本人の代筆ではありません。<a href="{note_url}">note版を読む</a>（同じ記事の転載）</p>\n'
    (folder/'index.html').write_text(front+attribution+body+'\n',encoding='utf-8')
    return {'key':key,'url':note_url,'path':'blog/articles/'+dirname,'permalink':meta['permalink'],'embeds':embeds,'images':images.stats,'content_sha256':hashlib.sha256((front+attribution+body+'\n').encode()).hexdigest()}

def install_snapshot(root, stage, manifest):
    base=root/'blog/articles'; manifest_path=root/'blog/note-mirror.json'
    if base.is_symlink() or (root/'blog').is_symlink() or manifest_path.is_symlink(): raise SyncError('Symlink output path refused')
    old=json.loads(manifest_path.read_text()) if manifest_path.exists() else {'articles':[]}
    managed={e['path'].split('/')[-1]:e['key'] for e in old['articles']}
    new={e['path'].split('/')[-1]:e['key'] for e in manifest['articles']}
    for name,key in {**managed,**new}.items():
        if not re.fullmatch(r'\d{4}-\d{2}-\d{2}-note-n[0-9a-f]{12}',name) or not KEY.fullmatch(key):
            raise SyncError('Invalid managed article path')
        folder=base/name
        if folder.is_symlink() or (folder/'index.html').is_symlink(): raise SyncError('Symlink managed path refused')
        if folder.exists():
            if name not in managed: raise SyncError('Unmanaged article collision')
            text=(folder/'index.html').read_text()
            if f'note_key: "{key}"' not in text or f'note_source: "https://note.com/{ACCOUNT}/n/{key}"' not in text:
                raise SyncError('Managed article identity mismatch')
    # Replace the whole article tree on the same filesystem; rollback on local I/O failure.
    with tempfile.TemporaryDirectory(prefix='.note-sync-',dir=root/'blog') as tmp:
        scratch=Path(tmp); replacement=scratch/'articles'; backup=scratch/'previous'
        shutil.copytree(base,replacement,symlinks=True)
        for name in managed:
            if (replacement/name).exists(): shutil.rmtree(replacement/name)
        for folder in stage.iterdir(): shutil.copytree(folder,replacement/folder.name)
        new_manifest=scratch/'manifest.json'
        new_manifest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
        os.replace(base,backup)
        try:
            os.replace(replacement,base)
            os.replace(new_manifest,manifest_path)
        except BaseException:
            if base.exists(): shutil.rmtree(base)
            os.replace(backup,base)
            raise

def publication_dates(manifest):
    if manifest.get('schema_version')!=1 or manifest.get('account')!=ACCOUNT or not isinstance(manifest.get('articles'),list):
        raise SyncError('Invalid published manifest')
    result={}
    for entry in manifest['articles']:
        key=entry.get('key',''); path=entry.get('path','')
        if not KEY.fullmatch(key) or key in result or not re.fullmatch(r'blog/articles/\d{4}-\d{2}-\d{2}-note-'+key,path):
            raise SyncError('Invalid published article identity')
        date=path.split('/')[-1][:10];datetime.strptime(date,'%Y-%m-%d')
        if entry.get('url')!=f'https://note.com/{ACCOUNT}/n/{key}' or entry.get('permalink')!=f'/blog/{date.replace("-","/")}/note-{key}/':
            raise SyncError('Invalid published article URLs')
        result[key]=date
    return result

def sync(root):
    keys=inventory()
    if not keys: raise SyncError('Empty account inventory; refusing mass removal')
    entries=[]
    old_path=root/'blog/note-mirror.json'
    old=json.loads(old_path.read_text()) if old_path.exists() else {'articles':[]}
    pinned=publication_dates(old) if old['articles'] else {}
    try:
        deployed=publication_dates(json.loads(fetch('https://xenoah.github.io/blog/note-mirror.json')))
    except HTTPError as exc:
        if exc.code != 404: raise
        deployed={}  # First deployment has no prior mirror manifest.
    for key,date in deployed.items():
        if key in pinned and pinned[key]!=date: raise SyncError('Published permalink conflict')
        pinned[key]=date
    # Stage a complete verified snapshot. Failure cannot leave half-written blog sources.
    with tempfile.TemporaryDirectory(prefix='note-blog-') as temp:
        stage=Path(temp)
        for key in keys:
            note=api('v3/notes/'+key)
            if note.get('key')!=key: raise SyncError('Detail identity mismatch')
            entries.append(render(note,stage,pinned.get(key)))
        manifest={'schema_version':1,'account':ACCOUNT,'articles':sorted(entries,key=lambda e:e['key'])}
        install_snapshot(root, stage, manifest)
    images=[i for e in entries for i in e['images']]
    print(json.dumps({'articles':len(entries),'images':len(images),'source_image_bytes':sum(i['source_bytes'] for i in images),'stored_image_bytes':sum(i['bytes'] for i in images),'x_api_calls':0}))
    return manifest

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[1]);args=parser.parse_args()
    try: sync(args.root.resolve())
    except Exception as exc:
        # Never dump remote HTML, API payloads or request bodies into public workflow logs.
        print('note mirror stopped: '+(str(exc) if isinstance(exc,SyncError) else type(exc).__name__))
        raise SystemExit(1)
