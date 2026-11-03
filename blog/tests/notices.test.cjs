const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
function setup(count=3, reduced=false) {
 const dom = new JSDOM(`<section data-notices><button data-notices-toggle hidden></button><span data-notices-help hidden></span><div class="notices-track"><ul class="notices-list">${Array.from({length:count},(_,i)=>`<li><a href="/blog/">${i}</a></li>`).join('')}</ul></div></section>`,{runScripts:'outside-only'});
 let change; const media={matches:reduced,addEventListener:(_,fn)=>change=fn};
 dom.window.matchMedia=()=>media;
 const script=fs.readFileSync(path.join(root,'assets/home-notices.js'),'utf8');
 dom.window.eval(script);
 return {dom,d:dom.window.document,media,change:()=>change(),script};
}
test('ticker preserves originals, hidden duplicate, pause/resume and initialization idempotence',()=>{
 const {dom,d,script}=setup(); const b=d.querySelector('button');
 assert.equal(d.querySelectorAll('li').length,6);assert.equal(d.querySelector('[data-notices-copy]').getAttribute('aria-hidden'),'true');
 assert.equal(d.querySelector('[data-notices-copy] a').tabIndex,-1);
 b.click();assert.equal(d.querySelectorAll('li').length,3);assert.equal(b.getAttribute('aria-pressed'),'true');
 b.click();dom.window.eval(script);assert.equal(d.querySelectorAll('li').length,6);dom.window.close();
});
test('reduced motion and live preference changes retain full original list',()=>{
 const {dom,d,media,change}=setup(3,true);assert.equal(d.querySelectorAll('li').length,3);assert.ok(d.querySelector('button').hidden);
 media.matches=false;change();assert.equal(d.querySelectorAll('li').length,6);
 media.matches=true;change();assert.equal(d.querySelectorAll('li').length,3);dom.window.close();
});
test('zero or one notice remains static without controls',()=>{for(const n of [0,1]){const {dom,d}=setup(n);assert.ok(d.querySelector('button').hidden);assert.equal(d.querySelectorAll('li').length,n);dom.window.close();}});
