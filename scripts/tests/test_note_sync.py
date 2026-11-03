import importlib.util, io, json, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
spec=importlib.util.spec_from_file_location('sync_note',Path(__file__).parents[1]/'sync-note.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class NoImages:
 def add(self,url): raise AssertionError('Image must not be fetched: '+url)
def note(**updates):
 d={'key':'n123456789abc','user':{'id':m.USER_ID,'urlname':m.ACCOUNT},'status':'published','is_published':True,'is_draft':False,'price':0,'is_limited':False,'is_r18':False,'type':'TextNote','name':'試験','publish_at':'2026-11-02T15:01:00+00:00','body':'<p>Independent prose.</p>','eyecatch':None,'hashtag_notes':[]};d.update(updates);return d
class TestSync(unittest.TestCase):
 def test_checked_in_mirrors_use_native_dates(self):
  root=Path(__file__).resolve().parents[2]
  for file in (root/'blog/articles').glob('*-note-n*/index.html'):
   text=file.read_text();self.assertRegex(text,r'(?m)^date: \d{4}-\d{2}-\d{2}$')
 def test_checked_in_manifest_hashes(self):
  root=Path(__file__).resolve().parents[2];manifest=json.loads((root/'blog/note-mirror.json').read_text())
  for entry in manifest['articles']:
   self.assertEqual(m.hashlib.sha256((root/entry['path']/'index.html').read_bytes()).hexdigest(),entry['content_sha256'])
 def test_strip_tweet_raw_and_image(self):
  body='<p>Independent.</p><figure embedded-service="twitter" data-src="https://x.com/shuminchuuu/status/123"><blockquote class="twitter-tweet">RAW THIRD PARTY<img src="https://evil.invalid/x.png"></blockquote></figure>'
  out,desc,count=m.clean_body(body,NoImages());self.assertNotIn('RAW',out);self.assertNotIn('evil',out);self.assertEqual(count,1);self.assertIn('status/123',out)
 def test_changed_embed_rejected(self):
  for body in ['<div embedded-service="twitter">RAW</div>','<div data-src="https://x.com/shuminchuuu/status/1">RAW</div>','<div class="embed-unknown">RAW</div>']:
   with self.assertRaises(m.SyncError):m.clean_body(body,NoImages())
 def test_standalone_tweet_stripped(self):
  out,_,_=m.clean_body('<blockquote class="twitter-tweet">RAW<a href="https://x.com/shuminchuuu/status/1">Date</a></blockquote>',NoImages());self.assertNotIn('RAW',out)
 def test_thirdparty_tweet_rejected(self):
  with self.assertRaises(m.SyncError):m.clean_body('<blockquote class="twitter-tweet"><a href="https://x.com/other/status/1">RAW</a></blockquote>',NoImages())
 def test_no_script_or_liquid(self):
  out,_,_=m.clean_body('<script>alert(1)</script><p onclick="x">{{site.secret}}{% include x %}</p><a href="javascript:evil()">safe</a>',NoImages());self.assertNotIn('<script',out);self.assertNotIn('onclick',out);self.assertNotIn('{{',out);self.assertNotIn('{%',out);self.assertNotIn('javascript',out)
 def test_attribute_sanitization(self):
  out,_,_=m.clean_body('<p style="url(evil)" data-secret="x">ok</p><iframe src="evil">raw</iframe>',NoImages());self.assertEqual(out,'<p>ok</p>')
 def test_external_image_rejected(self):
  with tempfile.TemporaryDirectory() as p:
   with self.assertRaises(m.SyncError):m.Images(Path(p),'/i').add('https://pbs.twimg.com/a.png')
 def test_free_published_owner_only(self):
  for override in [{'price':100},{'status':'draft'},{'is_draft':True},{'is_published':False},{'is_limited':True},{'is_r18':True},{'user':{'id':1,'urlname':m.ACCOUNT}}]:
   with tempfile.TemporaryDirectory() as p:
    with self.assertRaises(m.SyncError):m.render(note(**override),Path(p))
 def test_jst_date_and_idempotency(self):
  with tempfile.TemporaryDirectory() as a,tempfile.TemporaryDirectory() as b:
   first=m.render(note(),Path(a));second=m.render(note(),Path(b));self.assertEqual(first,second);self.assertIn('2026-11-03',first['path']);self.assertIn('date: 2026-11-03\n',(Path(a)/first['path'].split('/')[-1]/'index.html').read_text())
 def test_pinned_date_keeps_url(self):
  with tempfile.TemporaryDirectory() as p:
   entry=m.render(note(),Path(p),'2026-11-01');self.assertIn('/2026/11/01/',entry['permalink'])
 def test_prior_manifest_validation(self):
  with tempfile.TemporaryDirectory() as p:
   entry=m.render(note(),Path(p));manifest={'schema_version':1,'account':m.ACCOUNT,'articles':[entry]}
   self.assertEqual(m.publication_dates(manifest)[entry['key']],'2026-11-03')
   entry['permalink']='https://evil.invalid/'
   with self.assertRaises(m.SyncError):m.publication_dates(manifest)
 def test_symlink_index_rejected(self):
  with tempfile.TemporaryDirectory() as r,tempfile.TemporaryDirectory() as s:
   root=Path(r);base=root/'blog/articles';base.mkdir(parents=True);entry=m.render(note(),Path(s));manifest={'articles':[entry]};m.install_snapshot(root,Path(s),manifest)
   file=root/entry['path']/'index.html';text=file.read_text();file.unlink();target=root/'keep.txt';target.write_text(text);file.symlink_to(target)
   with self.assertRaises(m.SyncError):m.install_snapshot(root,Path(s),manifest)
   self.assertEqual(target.read_text(),text)
 def test_image_bounded_metadata_free(self):
  image=Image.new('RGB',(2400,1600),'blue');raw=io.BytesIO();image.save(raw,'JPEG',exif=b'Exif\x00\x00example')
  with tempfile.TemporaryDirectory() as p,patch.object(m,'fetch',return_value=raw.getvalue()):
   obj=m.Images(Path(p),'/a');r=obj.add('https://assets.st-note.com/img/1.jpg');obj.add('https://assets.st-note.com/img/1.jpg');self.assertEqual(len(obj.stats),1);self.assertEqual(r['width'],1280)
   file=next(Path(p).iterdir());self.assertLessEqual(file.stat().st_size,256000)
   with Image.open(file) as output:self.assertNotIn('exif',output.info)
 def test_image_count_limit(self):
  raw=io.BytesIO();Image.new('RGB',(2,2)).save(raw,'PNG')
  with tempfile.TemporaryDirectory() as p,patch.object(m,'fetch',return_value=raw.getvalue()):
   obj=m.Images(Path(p),'/a')
   for i in range(8):obj.add(f'https://assets.st-note.com/img/{i}.png')
   with self.assertRaises(m.SyncError):obj.add('https://assets.st-note.com/img/9.png')
 def test_inventory_duplicates_rejected(self):
  with patch.object(m,'api',return_value={'totalCount':2,'contents':[{'key':'n123456789abc'}]*2,'isLastPage':True}):
   with self.assertRaises(m.SyncError):m.inventory()
 def test_inventory_truncation_rejected(self):
  with patch.object(m,'api',return_value={'totalCount':2,'contents':[{'key':'n123456789abc'}],'isLastPage':True}):
   with self.assertRaises(m.SyncError):m.inventory()
 def test_unmanaged_collision_and_other_preservation(self):
  with tempfile.TemporaryDirectory() as r,tempfile.TemporaryDirectory() as s:
   root=Path(r);base=root/'blog/articles';base.mkdir(parents=True);(base/'manual').mkdir();(base/'manual/index.html').write_text('untouched')
   entry=m.render(note(),Path(s));manifest={'articles':[entry]};m.install_snapshot(root,Path(s),manifest)
   self.assertEqual((base/'manual/index.html').read_text(),'untouched');m.install_snapshot(root,Path(s),manifest)
   (root/'blog/note-mirror.json').unlink()
   with self.assertRaises(m.SyncError):m.install_snapshot(root,Path(s),manifest)
 def test_local_install_rolls_back(self):
  with tempfile.TemporaryDirectory() as r,tempfile.TemporaryDirectory() as s:
   root=Path(r);base=root/'blog/articles';base.mkdir(parents=True);(base/'original.txt').write_text('keep');entry=m.render(note(),Path(s));real=m.os.replace
   def fail(src,dst):
    if str(dst).endswith('note-mirror.json'):raise OSError('simulated disk failure')
    return real(src,dst)
   with patch.object(m.os,'replace',side_effect=fail):
    with self.assertRaises(OSError):m.install_snapshot(root,Path(s),{'articles':[entry]})
   self.assertEqual((base/'original.txt').read_text(),'keep');self.assertEqual(len(list(base.iterdir())),1)
if __name__=='__main__':unittest.main()
