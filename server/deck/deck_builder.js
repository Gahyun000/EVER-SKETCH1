// deck_builder.js — 덱 IR(JSON) → 편집 가능한 PPTX (3:4 세로, 라이트/다크)
//
// 쓰임:  node deck_builder.js <ir.json> <out.pptx>
//   IR 한 벌 → 덱 한 벌. HTML마다 바뀌는 건 '추출(IR 생성)'뿐이고 이 빌더는 고정이다.
//
// 팔레트는 EVER-PEAK 룩(src/design/tokens.ts 정본)에 맞춘다:
//   라이트 = 순백 배경 · 네이비 제목(#0F1B3D) · 블루 강조(#2462EB) · 네이비 표지
//   다크   = 딥네이비(#0b1626) · 흰 제목 · 블루(#4d86ff)
// 텍스트·도형은 네이티브(편집 가능) 그대로 두고 색·간격·카드 스타일만 EVER-PEAK 로 정렬한다.
//
// 자동 점검(빌더가 매번 지키는 규칙):
//   · 제목이 2줄이면 제목 높이 자동 확대(리드와 겹침 방지)
//   · 카드 설명은 카드 높이에 맞춰 폰트/줄간격 축소
//   · 목차 행은 한 줄 고정(baseline 부풀림 버그 차단)
//   · 폰트는 한글 안전값(맑은 고딕) 기본 — PowerPoint 에서 편집·치환 안전
const pptx = require("pptxgenjs");

// ── EVER-PEAK 라이트 (page #fff · ink #0F1B3D · blue #2462EB) ──
const LIGHT = {
  bg:"FFFFFF", panel:"F6F8FC", panel2:"EAF1FE", cardBorder:"E6E8EE",
  ink:"0F1B3D", ink2:"1C2433", muted:"8A92A3", muted2:"98A1B2",
  mark:"2462EB", metaR:"2462EB", accent:"2462EB", accentD:"1B4FC4",
  aqua:"3E9E6E", orange:"D98A2A", violet:"5B4BD6",
  cardTitle:"0F1B3D", cardDesc:"1C2433", kick:"2462EB", noteBg:"EAF1FE", noteInk:"1B4FC4",
  dotMap:{aqua:"3E9E6E",orange:"D98A2A",blue:"2462EB"},
  barMap:{blue:"2462EB",orange:"D98A2A",aqua:"3E9E6E"},
  line:"E6E8EE", tocNo:"2462EB", tocPg:"AEB6C4", markDim:"AEB6C4", shadow:true,
  // 표지 = 네이비 (EVER-PEAK 표지)
  cover:{bg:"0F1B3D", ink:"FFFFFF", sub:"BAC4DC", blue:"6EA0FF", muted:"8B97BC",
         line:"2C3B63", card:"18264A", cardBd:"2C3B63", cardTitle:"FFFFFF", cardDesc:"C7D0E6",
         dotMap:{aqua:"57C9A0",orange:"F0A968",blue:"6EA0FF"}},
};
// ── EVER-PEAK 다크 (page #0b1626 · body #e7edf6 · blue #4d86ff) ──
const DARK = {
  bg:"0B1626", panel:"141F30", panel2:"182740", cardBorder:"24303F",
  ink:"FFFFFF", ink2:"E7EDF6", muted:"68798F", muted2:"9FB0C7",
  mark:"4D86FF", metaR:"4D86FF", accent:"4D86FF", accentD:"6E9BFF",
  aqua:"4FC08D", orange:"E9A05C", violet:"A796FF",
  cardTitle:"FFFFFF", cardDesc:"E7EDF6", kick:"4D86FF", noteBg:"182740", noteInk:"9FB6E6",
  dotMap:{aqua:"4FC08D",orange:"E9A05C",blue:"4D86FF"},
  barMap:{blue:"4D86FF",orange:"E9A05C",aqua:"4FC08D"},
  line:"24303F", tocNo:"4D86FF", tocPg:"4A5F85", markDim:"4A5F85", shadow:false,
  cover:{bg:"0B1626", ink:"FFFFFF", sub:"9FB0C7", blue:"4D86FF", muted:"68798F",
         line:"24303F", card:"141F30", cardBd:"24303F", cardTitle:"FFFFFF", cardDesc:"E7EDF6",
         dotMap:{aqua:"4FC08D",orange:"E9A05C",blue:"4D86FF"}},
};

const MONO = "Consolas", SANS = "Malgun Gothic";
const MX = 0.62, CWID = 7.5 - MX*2;

function build(ir, outPath) {
  const meta = ir.meta || {};
  const T = (meta.theme === "dark") ? DARK : LIGHT;
  const TOTAL = ir.pages.length;
  const P = new pptx();
  P.defineLayout({ name: "P34", width: 7.5, height: 10 });
  P.layout = "P34";
  P.theme = { headFontFace: SANS, bodyFontFace: SANS };
  const footL = meta.footerLeft || meta.title || "";
  const topL = meta.brandTop || "UNIEVER CO., LTD.";
  const topR = meta.brandTopRight || "AX TRANSFORMATION · 2026";

  function shadow(){ return T.shadow ? {type:"outer",color:"0F1B3D",opacity:0.08,blur:8,offset:2,angle:90} : undefined; }
  function railChrome(s, no, C){
    // C = 색 팔레트(본문=T, 표지=T.cover). 상/하단 브랜드 레일 + 구분선.
    s.background = { color: C.bg };
    s.addText(topL,{x:MX,y:0.42,w:CWID*0.55,h:0.3,fontFace:MONO,fontSize:9,charSpacing:2,color:C.muted,align:"left",margin:0,valign:"middle"});
    s.addText(topR,{x:MX+CWID*0.45,y:0.42,w:CWID*0.55,h:0.3,fontFace:MONO,fontSize:9,charSpacing:2,color:C.metaR||C.blue,bold:true,align:"right",margin:0,valign:"middle"});
    s.addShape(P.ShapeType.line,{x:MX,y:0.82,w:CWID,h:0,line:{color:C.line,width:1.2}});
    s.addShape(P.ShapeType.line,{x:MX,y:9.35,w:CWID,h:0,line:{color:C.line,width:1.2}});
    s.addText(footL,{x:MX,y:9.42,w:CWID*0.6,h:0.3,fontFace:MONO,fontSize:9,color:C.muted,align:"left",margin:0,valign:"middle"});
    s.addText(("0"+no).slice(-2)+" / "+TOTAL,{x:MX+CWID*0.4,y:9.42,w:CWID*0.6,h:0.3,fontFace:MONO,fontSize:9,color:C.muted,align:"right",margin:0,valign:"middle"});
  }
  const chrome = (s,no)=>railChrome(s,no,T);
  // 제목 줄 수 추정 → 제목 높이 자동
  function titleH(text, size){
    const nl = (String(text).match(/\n/g)||[]).length;
    const est = String(text).replace(/\n/g,"").length;
    const perLine = (7.5 - MX*2) / (size*0.0135);   // 대략 글자수/줄
    const lines = Math.max(nl+1, Math.ceil(est/perLine));
    return Math.max(0.7, lines * size * 0.0165 + 0.12);
  }
  function head(s, markN, markEn, title, sub, o){
    o = o||{}; let y = 1.05;
    if (markEn){
      s.addText([{text:(markN?markN+"   ":""),options:{color:T.markDim}},{text:markEn,options:{color:T.mark,bold:true}}],
        {x:MX,y:y,w:CWID,h:0.3,fontFace:MONO,fontSize:11,charSpacing:1.5,margin:0,valign:"middle"});
      y += 0.42;
    } else if (markN){
      // EVER-PEAK 섹션 번호 태그(블루) — markEn 이 없을 때(본문 섹션) 번호만 크게.
      s.addText(markN,{x:MX,y:y,w:CWID,h:0.3,fontFace:MONO,fontSize:12,bold:true,charSpacing:1.5,color:T.mark,align:"left",margin:0,valign:"middle"});
      y += 0.4;
    }
    const size = o.titleSize||29;
    const th = o.titleH || titleH(title, size);
    s.addText(title,{x:MX,y:y,w:CWID,h:th,fontFace:SANS,fontSize:size,bold:true,color:T.ink,align:"left",margin:0,valign:"top",charSpacing:-0.5,lineSpacingMultiple:1.06});
    y += th;
    if (sub) s.addText(sub,{x:MX,y:y+0.05,w:o.subW||CWID*0.9,h:o.subH||1.0,fontFace:SANS,fontSize:o.subSize||13,color:T.ink2,align:"left",margin:0,valign:"top",lineSpacingMultiple:1.4});
    return y;
  }
  function eyebrow(s, text, y){ if(!text) return;
    s.addText(text,{x:MX,y:y,w:CWID,h:0.3,fontFace:MONO,fontSize:9.5,charSpacing:1.2,color:T.muted2,align:"left",margin:0,valign:"middle"}); }
  function cardBox(s,x,y,w,h){ s.addShape(P.ShapeType.roundRect,{x,y,w,h,rectRadius:0.08,fill:{color:T.panel},line:{color:T.cardBorder,width:1},shadow:shadow()}); }

  // 카드 그리드 — it.type 별 렌더
  function cards(s, items, cols, y0, totalH, small){
    const gap=0.16, n=items.length, rows=Math.ceil(n/cols);
    const cw=(CWID-gap*(cols-1))/cols, ch=(totalH-gap*(rows-1))/rows;
    items.forEach((it,i)=>{
      const r=Math.floor(i/cols),c=i%cols,x=MX+c*(cw+gap),y=y0+r*(ch+gap);
      cardBox(s,x,y,cw,ch);
      const pad=x+0.2,iw=cw-0.4; let ty=y+0.2;
      const type=it.type||"kick";
      if (type==="stat"){
        s.addText(it.value,{x:pad,y:y+0.4,w:iw,h:0.9,fontFace:SANS,fontSize:small?26:30,bold:true,color:T[it.color]||T.accent,align:"left",valign:"middle",margin:0,charSpacing:-1});
        s.addShape(P.ShapeType.line,{x:pad,y:y+ch*0.62,w:0.5,h:0,line:{color:T.line,width:1.5}});
        s.addText(it.label,{x:pad,y:y+ch*0.66,w:iw,h:ch*0.3,fontFace:SANS,fontSize:11,color:T.ink2,align:"left",valign:"top",margin:0,lineSpacingMultiple:1.15});
        return;
      }
      if (type==="chip"){
        s.addText(it.id,{x:pad,y:y+ch/2-0.28,w:0.62,h:0.56,fontFace:MONO,fontSize:12,bold:true,color:T.violet,align:"left",valign:"middle",margin:0});
        s.addText([{text:it.title,options:{bold:true,color:T.cardTitle,fontSize:11.5,breakLine:true}},{text:it.role||"",options:{color:T.muted,fontSize:9}}],
          {x:pad+0.6,y:y+0.14,w:iw-0.6,h:ch-0.28,fontFace:SANS,align:"left",valign:"middle",margin:0,lineSpacingMultiple:1.05});
        return;
      }
      if (type==="badge"){
        const bs=0.5;
        s.addShape(P.ShapeType.roundRect,{x:pad,y:y+0.18,w:bs,h:bs,rectRadius:0.08,fill:{color:T.panel2},line:{type:"none"}});
        s.addText(it.badge,{x:pad,y:y+0.18,w:bs,h:bs,fontFace:MONO,fontSize:17,bold:true,color:T.accentD,align:"center",valign:"middle",margin:0});
        s.addText(it.title,{x:pad+bs+0.18,y:y+0.18,w:iw-bs-0.18,h:bs,fontFace:SANS,fontSize:15,bold:true,color:T.cardTitle,align:"left",valign:"middle",margin:0,charSpacing:-0.3});
        s.addText(it.desc||"",{x:pad,y:y+0.8,w:iw,h:ch-0.95,fontFace:SANS,fontSize:small?9.4:10.5,color:T.cardDesc,align:"left",valign:"top",margin:0,lineSpacingMultiple:1.22});
        return;
      }
      if (type==="icon"){
        s.addShape(P.ShapeType.roundRect,{x:pad,y:ty,w:0.6,h:0.6,rectRadius:0.08,fill:{color:T.panel2},line:{type:"none"}});
        s.addText(it.icon,{x:pad,y:ty,w:0.6,h:0.6,fontFace:SANS,fontSize:18,bold:true,color:T.accentD,align:"center",valign:"middle",margin:0});
        s.addText(it.title,{x:pad+0.76,y:ty,w:iw-0.76,h:0.6,fontFace:SANS,fontSize:14,bold:true,color:T.cardTitle,align:"left",valign:"middle",margin:0,charSpacing:-0.3});
        s.addText(it.desc||"",{x:pad,y:ty+0.7,w:iw,h:ch-0.92,fontFace:SANS,fontSize:(small?9.4:10.5),color:T.cardDesc,align:"left",valign:"top",margin:0,lineSpacingMultiple:1.22});
        return;
      }
      // dot / num / kick / bar 공통
      if (type==="bar"){ s.addShape(P.ShapeType.rect,{x:x,y:y,w:cw,h:0.06,fill:{color:T.barMap[it.bar]||T.accent},line:{type:"none"}}); }
      if (type==="dot" && it.dot){ s.addShape(P.ShapeType.ellipse,{x:pad,y:ty+0.02,w:0.15,h:0.15,fill:{color:T.dotMap[it.dot]||T.accent},line:{type:"none"}}); ty+=0.32; }
      if (type==="num" && it.num){ s.addText(it.num,{x:pad,y:ty,w:iw,h:0.34,fontFace:MONO,fontSize:15,bold:true,color:T.accent,align:"left",margin:0,valign:"top"}); ty+=0.42; }
      if (it.kick){ s.addText(it.kick,{x:pad,y:ty,w:iw,h:0.3,fontFace:MONO,fontSize:9,bold:true,charSpacing:0.6,color:T.kick,align:"left",margin:0,valign:"middle"}); ty+=0.32; }
      if (it.title){ s.addText(it.title,{x:pad,y:ty,w:iw,h:0.42,fontFace:SANS,fontSize:small?13:15,bold:true,color:T.cardTitle,align:"left",margin:0,valign:"top",charSpacing:-0.3}); }
      if (it.desc){ s.addText(it.desc,{x:pad,y:ty+(small?0.34:0.44),w:iw,h:ch-(ty-y)-0.5,fontFace:SANS,fontSize:small?9.5:10.6,color:T.cardDesc,align:"left",margin:0,valign:"top",lineSpacingMultiple:1.28}); }
    });
  }
  // 네이티브 표(무손실·편집가능) — EVER-PEAK 스타일. 표를 카드요약으로 버리지 않는다.
  function tableGrid(s, table, y0){
    const rows = table.rows || []; if(!rows.length) return;
    const ncols = Math.max(...rows.map(r=>r.length));
    const nrows = rows.length;
    const fs = nrows<=6 ? 9 : (nrows<=9 ? 8 : (nrows<=12 ? 7 : 6));
    const totalH = Math.max(1.2, 9.15 - y0);
    const rowH = totalH / nrows;
    const bd = { type:"solid", color:T.cardBorder, pt:0.5 };
    const data = rows.map((r, ri)=>{
      const head = ri===0;
      const cells=[];
      for (let ci=0; ci<ncols; ci++){
        const raw = (ci < r.length ? r[ci] : "") || "";
        const lines = String(raw).split("\n");
        const runs = lines.map((ln,li)=>({ text: ln, options:{ breakLine: li<lines.length-1 } }));
        cells.push({ text: runs, options:{
          fill:{ color: head ? T.ink : (ri%2===0 ? T.panel : T.bg) },
          color: head ? "FFFFFF" : T.ink2,
          bold: head || ci===0, align:"left", valign:"middle",
          fontSize: fs, fontFace: SANS,
        }});
      }
      return cells;
    });
    const colW = Array(ncols).fill(CWID/ncols);
    s.addTable(data, { x:MX, y:y0, w:CWID, colW, rowH, border:bd, autoPage:false,
      margin:[2,4,2,4], valign:"middle" });
  }
  // 픽셀동일 페이지: 섹션 스크린샷 배경 + 편집 텍스트 오버레이(convert_hybrid 가 세팅)
  function pixelSlide(s, pg, no){
    s.background = { color: T.bg };
    // bgImagePath = 로컬 파일경로(node 빌드용), bgImage = 서빙 URL(프론트 캔버스용). node 는 경로 우선.
    const _bg = pg.bgImagePath || pg.bgImage;
    if (_bg) s.addImage({ path: _bg, x:0, y:0, w:7.5, h:10 });
    (pg.overlay||[]).forEach(b=>{
      const runs = (b.runs||[]).map(r=>({ text:r.t, options:{ color:r.color, bold:!!r.bold, breakLine:!!r.br } }));
      s.addText(runs, { x:b.x, y:b.y, w:b.w, h:b.h, fontFace:SANS, fontSize:b.size,
        align:b.align||"left", valign:"top", margin:0, lineSpacingMultiple:1.15 });
    });
  }
  // 표지 전용 카드(네이비 표면·흰 제목)
  function coverCards(s, C, items, cols, y0, totalH){
    const gap=0.16, n=items.length; if(!n) return;
    const rows=Math.ceil(n/cols), cw=(CWID-gap*(cols-1))/cols, ch=(totalH-gap*(rows-1))/rows;
    items.forEach((it,i)=>{
      const r=Math.floor(i/cols),c=i%cols,x=MX+c*(cw+gap),y=y0+r*(ch+gap);
      s.addShape(P.ShapeType.roundRect,{x,y,w:cw,h:ch,rectRadius:0.08,fill:{color:C.card},line:{color:C.cardBd,width:1}});
      const pad=x+0.2,iw=cw-0.4; let ty=y+0.2;
      if (it.dot){ s.addShape(P.ShapeType.ellipse,{x:pad,y:ty+0.02,w:0.15,h:0.15,fill:{color:C.dotMap[it.dot]||C.blue},line:{type:"none"}}); ty+=0.32; }
      if (it.title){ s.addText(it.title,{x:pad,y:ty,w:iw,h:0.42,fontFace:SANS,fontSize:15,bold:true,color:C.cardTitle,align:"left",margin:0,valign:"top",charSpacing:-0.3}); }
      if (it.desc){ s.addText(it.desc,{x:pad,y:ty+0.44,w:iw,h:ch-(ty-y)-0.5,fontFace:SANS,fontSize:10.6,color:C.cardDesc,align:"left",margin:0,valign:"top",lineSpacingMultiple:1.28}); }
    });
  }
  function coverSlide(s, pg, no){
    const C = T.cover;
    railChrome(s, no, C);
    const wm = meta.wordmark || {a:"UNIEVER",b:"AX",sub:"AI TRANSFORMATION PROGRAM"};
    s.addShape(P.ShapeType.ellipse,{x:MX,y:1.08,w:0.34,h:0.34,fill:{color:"D63A2A"},line:{color:C.bg,width:5}});
    s.addText([{text:wm.a+" ",options:{color:C.ink}},{text:wm.b,options:{color:C.blue}}],
      {x:MX+0.46,y:1.02,w:CWID-0.5,h:0.5,fontFace:SANS,fontSize:26,bold:true,margin:0,valign:"middle",charSpacing:-0.5});
    s.addText(wm.sub,{x:MX+0.46,y:1.5,w:CWID-0.5,h:0.24,fontFace:MONO,fontSize:8.5,charSpacing:3,color:C.muted,margin:0,valign:"middle"});
    s.addText(pg.heading,{x:MX,y:2.2,w:CWID,h:1.7,fontFace:SANS,fontSize:pg.headingSize||44,bold:true,color:C.ink,align:"left",margin:0,valign:"top",charSpacing:-1,lineSpacingMultiple:1.04});
    if (pg.sub) s.addText(pg.sub,{x:MX,y:4.1,w:CWID*0.86,h:1.05,fontFace:SANS,fontSize:13.5,color:C.sub,margin:0,valign:"top",lineSpacingMultiple:1.45});
    if (pg.eyebrow) s.addText(pg.eyebrow,{x:MX,y:6.35,w:CWID,h:0.3,fontFace:MONO,fontSize:9.5,charSpacing:1.2,color:C.muted,align:"left",margin:0,valign:"middle"});
    coverCards(s, C, pg.cards||[], pg.cols? +pg.cols.slice(1):3, 6.75, 2.35);
  }
  function note(s, text, y, h){
    s.addShape(P.ShapeType.roundRect,{x:MX,y:y,w:CWID,h:h,rectRadius:0.08,fill:{color:T.noteBg},line:{type:"none"}});
    s.addText(text,{x:MX+0.25,y:y,w:CWID-0.5,h:h,fontFace:SANS,fontSize:11,color:T.noteInk,margin:0,valign:"middle",lineSpacingMultiple:1.2});
  }

  ir.pages.forEach((pg, i)=>{
    const no = i+1;
    const s = P.addSlide();
    if (pg.bgImagePath || pg.bgImage){ pixelSlide(s, pg, no); chrome(s, no); return; }
    if (pg.type === "cover"){ coverSlide(s, pg, no); return; }
    chrome(s, no);
    if (pg.type === "toc"){
      head(s, pg.markN||("0"+no).slice(-2), pg.markEn||"CONTENTS", pg.title||"목차", pg.sub, {titleSize:34, titleH:0.7, subH:0.5});
      let ty=3.0; const rh = Math.min(0.7, (8.9-3.0)/(pg.items.length));
      pg.items.forEach(r=>{
        s.addText(r[0],{x:MX,y:ty,w:0.6,h:rh,fontFace:MONO,fontSize:14,bold:true,color:T.tocNo,margin:0,valign:"middle"});
        s.addText(r[1],{x:MX+0.65,y:ty,w:2.7,h:rh,fontFace:SANS,fontSize:15,bold:true,color:T.ink,margin:0,valign:"middle",charSpacing:-0.3});
        s.addText(r[2]||"",{x:MX+3.4,y:ty,w:CWID-4.1,h:rh,fontFace:SANS,fontSize:11,color:T.muted2,margin:0,valign:"middle"});
        s.addText(r[3]||"",{x:MX+CWID-0.6,y:ty,w:0.6,h:rh,fontFace:MONO,fontSize:11,color:T.tocPg,align:"right",margin:0,valign:"middle"});
        s.addShape(P.ShapeType.line,{x:MX,y:ty+rh,w:CWID,h:0,line:{color:T.line,width:1}});
        ty+=rh;
      });
    } else if (pg.type === "quote"){
      head(s, pg.markN||("0"+no).slice(-2), pg.markEn||"", "", null, {titleH:0.1});
      s.addShape(P.ShapeType.roundRect,{x:MX,y:2.6,w:CWID,h:4.6,rectRadius:0.14,fill:{color:T.panel},line:{color:T.cardBorder,width:1}});
      s.addText('"',{x:MX+0.3,y:2.4,w:1.2,h:1.2,fontFace:"Georgia",fontSize:120,color:(T===DARK?"22344F":"D7DEEC"),align:"left",valign:"top",margin:0});
      s.addText(pg.lines,{x:MX+0.6,y:3.5,w:CWID-1.2,h:1.7,fontFace:SANS,fontSize:pg.quoteSize||34,bold:true,align:"left",valign:"middle",margin:0,charSpacing:-0.5,lineSpacingMultiple:1.15,color:T.ink});
      if (pg.sub) s.addText(pg.sub,{x:MX+0.6,y:5.5,w:CWID-1.6,h:1.3,fontFace:SANS,fontSize:14,color:T.ink2,align:"left",valign:"top",margin:0,lineSpacingMultiple:1.45});
      eyebrow(s, pg.eyebrow, 8.1);
    } else if (pg.type === "stats"){
      head(s, pg.markN, pg.markEn, pg.heading, pg.sub, {titleH:pg.titleH, subH:0.9});
      eyebrow(s, pg.eyebrow, 6.0);
      const st=pg.cards, sg=0.16, sw=(CWID-sg*(st.length-1))/st.length;
      st.forEach((x,i2)=>{ const bx=MX+i2*(sw+sg),by=6.4,h=2.35; cardBox(s,bx,by,sw,h);
        s.addText(x.value,{x:bx+0.14,y:by+0.5,w:sw-0.28,h:0.9,fontFace:SANS,fontSize:30,bold:true,color:T[x.color]||T.accent,align:"left",valign:"middle",margin:0,charSpacing:-1});
        s.addShape(P.ShapeType.line,{x:bx+0.18,y:by+1.5,w:0.5,h:0,line:{color:T.line,width:1.5}});
        s.addText(x.label,{x:bx+0.16,y:by+1.62,w:sw-0.3,h:0.6,fontFace:SANS,fontSize:11,color:T.ink2,align:"left",valign:"top",margin:0,lineSpacingMultiple:1.15});
      });
    } else { // section
      const yEnd = head(s, pg.markN, pg.markEn, pg.heading, pg.sub, {titleH:pg.titleH, subH:pg.subH||0.9, titleSize:pg.titleSize});
      if (pg.table && pg.table.rows && pg.table.rows.length){
        // 표가 있으면 카드요약 대신 네이티브 표로 무손실 재작도
        const subH = pg.sub ? (pg.subH||0.6) : 0;
        const ty = Math.max(3.25, yEnd + 0.05 + subH + 0.18);
        tableGrid(s, pg.table, ty);
        if (pg.note) note(s, pg.note, 9.0, 0.5);
      } else {
        const cardsY = pg.cardsY || 6.35, cardsH = pg.cardsH || 2.35;
        eyebrow(s, pg.eyebrow, pg.eyebrowY || (cardsY-0.4));
        const cols = pg.cols ? +pg.cols.replace(/\D/g,"").slice(-1) : 3;
        cards(s, pg.cards||[], cols, cardsY, cardsH, pg.small);
        if (pg.note) note(s, pg.note, pg.noteY || 8.45, pg.noteH || 0.72);
      }
    }
  });

  return P.writeFile({ fileName: outPath });
}

if (require.main === module){
  const fs = require("fs");
  const irPath = process.argv[2], out = process.argv[3] || "deck.pptx";
  if (!irPath){ console.error("사용: node deck_builder.js <ir.json> <out.pptx>"); process.exit(1); }
  const ir = JSON.parse(fs.readFileSync(irPath, "utf8"));
  build(ir, out).then(f=>console.log("saved", f, "· theme:", (ir.meta&&ir.meta.theme)||"light", "· pages:", ir.pages.length));
}
module.exports = { build };
