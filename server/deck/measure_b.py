# -*- coding: utf-8 -*-
"""B안(픽셀동일 하이브리드): 스크롤형 HTML을 3:4 슬라이드로 페이지네이션하고
각 슬라이드의 '글자 없는 배경 PNG' + 편집 가능한 텍스트 상자를 추출한다.

원본 CSS 맥락(.hero / .layout>.main section / .side)을 보존하려고 각 유닛을
원래 조상 래퍼로 감싼 뒤, 페이지보다 크면 transform:scale(k)로 축소한다.
좌표(getBoundingClientRect)는 스케일 후 시각값이라 그대로 쓰고, 폰트 크기만 *k 보정.
"""
import json, os, sys
from playwright.sync_api import sync_playwright

PAGE_W, PAGE_H = 1500, 2000
PAD = 70

BUILD_JS = r"""(cfg) => {
  const {PAGE_W, PAGE_H, PAD} = cfg;
  const hero = document.querySelector('header.hero');
  const aside = document.querySelector('aside.side');
  const sections = [...document.querySelectorAll('main.main > section')];

  // 슬라이드 유닛: [종류, innerHTML]
  const units = [];
  units.push(['cover', hero.outerHTML]);
  if (aside) units.push(['toc', '<div class="layout"><aside class="side" style="width:100%;position:static;box-shadow:none">'+aside.innerHTML+'</aside></div>']);
  for (const s of sections) units.push(['sec', '<div class="layout" style="display:block"><main class="main">'+s.outerHTML+'</main></div>']);

  // 원본 본문 치우고 덱 컨테이너 구성
  const deck = document.createElement('div'); deck.id='deck';
  document.body.innerHTML=''; document.body.appendChild(deck);
  document.body.style.background='#5a6172';

  const ks=[];
  units.forEach((u,i)=>{
    const slide=document.createElement('div');
    slide.className='slide'; slide.id='s'+i;
    slide.style.cssText='width:'+PAGE_W+'px;height:'+PAGE_H+'px;background:#fff;position:relative;overflow:hidden;margin:20px auto;';
    const body=document.createElement('div');
    body.className='slidebody';
    const inner = (u[0]==='cover') ? PAGE_W : (PAGE_W - 2*PAD);
    body.style.cssText='position:absolute;left:'+(u[0]==='cover'?0:PAD)+'px;top:'+(u[0]==='cover'?0:PAD)+'px;width:'+inner+'px;transform-origin:top left;';
    body.innerHTML=u[1];
    slide.appendChild(body); deck.appendChild(slide);
    // 스케일 계산
    const avail = (u[0]==='cover') ? PAGE_H : (PAGE_H - 2*PAD);
    const h = body.scrollHeight;
    let k = h>avail ? avail/h : 1;
    body.style.transform='scale('+k+')';
    ks.push(k);
  });
  return ks;
}"""

# measure_text.py의 추출 로직(런 단위) — size/lh만 *k 보정해서 반환
EXTRACT_JS = r"""(arg) => {
  const {sel, k} = arg;
  function isInline(el){ if(el.tagName==="BR")return true; return getComputedStyle(el).display.startsWith("inline"); }
  function isInlineOnly(el){ for(const c of el.children){ if(c.tagName==="SVG"||c.tagName==="svg")return false; if(!isInline(c))return false;} return true; }
  function hasText(el){ return el.textContent.replace(/\s/g,"").length>0; }
  const page=document.querySelector(sel); const base=page.getBoundingClientRect(); const blocks=[];
  function walk(el){
    if(el.tagName==="SVG"||el.tagName==="svg")return;
    const disp=getComputedStyle(el).display;
    const isFlex=disp==="flex"||disp==="grid"||disp==="inline-flex"||disp==="inline-grid";
    let hasBlockChild=false;
    for(const c of el.children){ if(c.tagName==="SVG"||c.tagName==="svg")continue; if(!isInline(c)&&hasText(c)){hasBlockChild=true;break;} }
    if(hasBlockChild||(isFlex&&el.children.length>1)){ for(const c of el.children) walk(c); return; }
    if(!hasText(el)||!isInlineOnly(el))return;
    const cs=getComputedStyle(el); const r=el.getBoundingClientRect();
    if(r.width<2||r.height<2)return;
    const runs=[];
    function pushText(t,color,weight){ if(t)runs.push({t,color,weight,br:false}); }
    function emit(node,ic,iw){ node.childNodes.forEach(n=>{ if(n.nodeType===3){pushText(n.textContent,ic,iw);} else if(n.nodeType===1){ if(n.tagName==="BR"){runs.push({t:"",br:true});return;} const s=getComputedStyle(n); emit(n,s.color,s.fontWeight);} }); }
    emit(el,cs.color,cs.fontWeight);
    if(!runs.length)return;
    blocks.push({ x:r.left-base.left, y:r.top-base.top, w:r.width, h:r.height,
      size:parseFloat(cs.fontSize)*k, lh:(parseFloat(cs.lineHeight)||parseFloat(cs.fontSize)*1.3)*k,
      align:cs.textAlign, ls:parseFloat(cs.letterSpacing)||0, family:cs.fontFamily,
      runs: runs.map(x=>({t:x.t, br:x.br, color:x.color||cs.color, weight:parseInt(x.weight||cs.fontWeight)||400})) });
    el.setAttribute("data-txtbox","1");
  }
  walk(page); return blocks;
}"""

HIDE_JS = r"""() => { document.querySelectorAll('[data-txtbox]').forEach(el=>{ el.style.color="transparent"; el.querySelectorAll("*:not(svg *)").forEach(c=>{c.style.color="transparent";}); }); }"""

def main():
    html_path, out_dir = sys.argv[1], sys.argv[2]
    os.makedirs(out_dir, exist_ok=True)
    with sync_playwright() as p:
        b=p.chromium.launch(args=["--no-sandbox","--disable-gpu","--font-render-hinting=none"])
        pg=b.new_page(viewport={"width":PAGE_W,"height":PAGE_H},device_scale_factor=2)
        pg.goto("file://"+os.path.abspath(html_path)); pg.wait_for_timeout(1500)
        ks=pg.evaluate(BUILD_JS, {"PAGE_W":PAGE_W,"PAGE_H":PAGE_H,"PAD":PAD})
        n=len(ks); allboxes=[]
        for i in range(n):
            boxes=pg.evaluate(EXTRACT_JS, {"sel":"#s%d"%i,"k":ks[i]})
            for bx in boxes: bx["page"]=i
            allboxes.extend(boxes)
        pg.evaluate(HIDE_JS); pg.wait_for_timeout(300)
        for i in range(n):
            pg.locator("#s%d"%i).screenshot(path=os.path.join(out_dir,"bg_%d.png"%i))
        b.close()
    json.dump({"pages":n,"w":PAGE_W,"h":PAGE_H,"boxes":allboxes},
              open(os.path.join(out_dir,"boxes.json"),"w",encoding="utf-8"),ensure_ascii=False)
    print("B: 슬라이드 %d · 텍스트상자 %d개 · scale=%s"%(n,len(allboxes),["%.2f"%x for x in ks]))

if __name__=="__main__": main()
