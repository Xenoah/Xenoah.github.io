import hashlib,importlib.util,io,json,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
from PIL import Image
spec=importlib.util.spec_from_file_location('diary_import',Path(__file__).parents[1]/'import-diary.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
spec=importlib.util.spec_from_file_location('sync_note',Path(__file__).parents[1]/'sync-note.py');n=importlib.util.module_from_spec(spec);spec.loader.exec_module(n)
class TestDiary(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.base=Path(self.tmp.name);self.root=self.base/'site';self.folder=self.base/'bundle';self.folder.mkdir();(self.root/'blog/articles').mkdir(parents=True)
  out=io.BytesIO();Image.new('RGB',(1800,1000),'navy').save(out,'PNG');self.raw=out.getvalue();(self.folder/'cover.png').write_bytes(self.raw)
  self.data={'schema_version':1,'date_jst':'2026-11-03','title':'2026-11-03｜試験','tags':['AI助手日記'],'body_markdown':'AI助手による独立した文章。\n\n## 考察\n\n{{X_EMBED:123}}\n\n[公式](https://example.org/)','source_urls':['https://x.com/shuminchuuu/status/123'],'article_digest':'a'*64,'cover':{'path':'cover.png','alt':'自作抽象カバー','sha256':m.digest(self.raw)}}
 def bundle(self):
  raw=(json.dumps(self.data,ensure_ascii=False)+'\n').encode();(self.folder/'bundle.json').write_bytes(raw);return m.digest(raw)
 def publish(self):return m.import_bundle(self.root,self.folder,self.bundle())
 def test_offline_publish_idempotent(self):
  with patch('urllib.request.urlopen',side_effect=AssertionError('network')):first=self.publish();second=self.publish()
  self.assertEqual(first,second);self.assertIsNone(first['note_url']);self.assertEqual(len(m.validate_repository(self.root)['articles']),1)
  text=(self.root/first['path']/'index.html').read_text();self.assertIn('date: 2026-11-03\n',text);self.assertIn('has_x_embeds: true',text);self.assertIn('note版は後日掲載予定',text);self.assertIn('status/123',text)
 def test_bundle_hash_required(self):
  self.bundle()
  with self.assertRaises(m.ImportError):m.import_bundle(self.root,self.folder,'b'*64)
 def test_extra_private_fields_refused(self):
  for key in ('source','reference_run_id','checks','publication'):
   self.data[key]={}
   with self.assertRaises(m.ImportError):self.publish()
   del self.data[key]
 def test_extra_files_refused(self):
  (self.folder/'source.json').write_text('{}')
  with self.assertRaises(m.ImportError):self.publish()
 def test_raw_embed_and_external_images_refused(self):
  for body in ('> raw','![x](https://example.org/x.png)','<script>alert(1)</script>','https://x.com/other/status/1'):
   self.data['body_markdown']=body+'\n{{X_EMBED:123}}'
   with self.assertRaises(m.ImportError):self.publish()
 def test_escape_html_and_liquid(self):
  self.data['body_markdown']+='\n\n{{site.secret}} {% include secret %} <div onclick="evil">text</div>'
  e=self.publish();body=(self.root/e['path']/'index.html').read_text().split('---',2)[2];self.assertNotIn('{{',body);self.assertNotIn('{%',body);self.assertNotIn('<div',body)
 def test_cover_hash_and_path(self):
  self.data['cover']['sha256']='b'*64
  with self.assertRaises(m.ImportError):self.publish()
  self.data['cover']['path']='../cover.png'
  with self.assertRaises(m.ImportError):self.publish()
 def test_immutable_existing_day(self):
  e=self.publish();self.data['article_digest']='b'*64
  with self.assertRaises(m.ImportError):self.publish()
  self.data['article_digest']='a'*64;self.data['body_markdown']+='different'
  with self.assertRaises(m.ImportError):self.publish()
  self.assertEqual(m.validate_repository(self.root)['articles'][0],e)
 def test_unknown_target_preserved(self):
  path=self.root/m.urls('2026-11-03')[0];path.mkdir();(path/'mine.txt').write_text('keep')
  with self.assertRaises(m.ImportError):self.publish()
  self.assertEqual((path/'mine.txt').read_text(),'keep')
 def test_link_is_only_metadata_idempotent(self):
  e=self.publish();url='https://note.com/xenoah_memo/n/n123456789abc';linked=m.link_note(self.root,'2026-11-03',url,'a'*64);self.assertEqual(m.link_note(self.root,'2026-11-03',url,'a'*64),linked)
  self.assertEqual(linked['permalink'],e['permalink']);self.assertIn(url,(self.root/e['path']/'index.html').read_text());m.validate_repository(self.root)
  with self.assertRaises(m.ImportError):m.link_note(self.root,'2026-11-03','https://note.com/other/n/n123456789abc','a'*64)
 def test_manifest_fail_rolls_back_initial(self):
  original=m.os.replace
  def fail(src,dst):
   if str(dst).endswith('pages-first.json'):raise OSError('disk')
   return original(src,dst)
  with patch.object(m.os,'replace',side_effect=fail):
   with self.assertRaises(OSError):self.publish()
  self.assertFalse((self.root/m.urls('2026-11-03')[0]).exists())
 def test_manifest_fail_rolls_back_link(self):
  e=self.publish();path=self.root/e['path']/'index.html';old=path.read_bytes();original=m.os.replace
  def fail(src,dst):
   if str(dst).endswith('pages-first.json'):raise OSError('disk')
   return original(src,dst)
  with patch.object(m.os,'replace',side_effect=fail):
   with self.assertRaises(OSError):m.link_note(self.root,'2026-11-03','https://note.com/xenoah_memo/n/n123456789abc','a'*64)
  self.assertEqual(path.read_bytes(),old);m.validate_repository(self.root)
 def test_parent_symlink_link_refused(self):
  e=self.publish();target=self.root/e['path'];renamed=self.base/'old';target.rename(renamed);target.symlink_to(renamed,target_is_directory=True)
  with self.assertRaises(m.ImportError):m.link_note(self.root,'2026-11-03','https://note.com/xenoah_memo/n/n123456789abc','a'*64)
 def test_note_sync_deduplicates_pending_and_linked(self):
  e=self.publish();self.assertTrue(n.pages_owns_note({'key':'n123456789abc','name':self.data['title']},[e]))
  self.assertFalse(n.pages_owns_note({'key':'n123456789abc','name':'2026-11-02過去'},[e]))
  with self.assertRaises(n.SyncError):n.pages_owns_note({'key':'n123456789abc','name':'2026-11-03異なる記事'},[e])
 def test_note_sync_install_preserves_pages(self):
  e=self.publish();path=self.root/e['path']/'index.html';old=path.read_bytes();stage=self.base/'stage';stage.mkdir();n.install_snapshot(self.root,stage,{'articles':[]});self.assertEqual(path.read_bytes(),old);m.validate_repository(self.root)
 def test_historical_date_refused(self):
  self.data['date_jst']='2026-11-02'
  with self.assertRaises(m.ImportError):self.publish()
 def test_manifest_private_field_refused(self):
  self.publish();p=self.root/'blog/pages-first.json';v=json.loads(p.read_text());v['articles'][0]['raw']='private';p.write_text(json.dumps(v))
  with self.assertRaises(m.ImportError):m.validate_repository(self.root)
if __name__=='__main__':unittest.main()
