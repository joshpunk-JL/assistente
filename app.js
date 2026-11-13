'use strict';
/* ===== utilidades ===== */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad=n=>String(n).padStart(2,'0');
const ymd=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const pd=s=>{const[a,b,c]=s.split('-').map(Number);return new Date(a,b-1,c)};
const addD=(s,n)=>{const d=pd(s);d.setDate(d.getDate()+n);return ymd(d)};
const mk=s=>s.slice(0,7);
const addM=(k,n)=>{let[y,m]=k.split('-').map(Number);m+=n-1;y+=Math.floor(m/12);m=((m%12)+12)%12;return y+'-'+pad(m+1)};
const dim=(y,m)=>new Date(y,m,0).getDate();
const MES=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
const MESL=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DOW=['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
const today=()=>ymd(new Date());
const nowT=()=>Date.now();
const uid=()=>Math.random().toString(36).slice(2,9)+nowT().toString(36).slice(-3);
const brl=n=>(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const nf=n=>(n||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
const dbr=s=>s.slice(8)+'/'+s.slice(5,7)+'/'+s.slice(0,4);
const mlab=k=>MES[+k.slice(5)-1]+'/'+k.slice(2,4);
function parseNum(s){s=String(s).trim().replace(/[R$\s]/g,'');if(!s)return null;
  if(s.includes(','))s=s.replace(/\./g,'').replace(',','.');
  else if(/^-?\d{1,3}(\.\d{3})+$/.test(s))s=s.replace(/\./g,'');
  const v=parseFloat(s);return isNaN(v)?undefined:Math.round(v*100)/100}
const LS=localStorage;
const lg=(k,d)=>{try{const v=LS.getItem(k);return v==null?d:JSON.parse(v)}catch{return d}};
const ls=(k,v)=>{try{LS.setItem(k,JSON.stringify(v))}catch{}};
function b64e(str){const b=new TextEncoder().encode(str);let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return btoa(s)}
function b64d(b){const s=atob(b.replace(/\s/g,''));const a=new Uint8Array(s.length);for(let i=0;i<s.length;i++)a[i]=s.charCodeAt(i);return new TextDecoder().decode(a)}
function canon(o){return JSON.stringify(o,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.keys(v).sort().reduce((r,x)=>(r[x]=v[x],r),{}):v)}

/* ===== dados ===== */
function newData(){
  const S=JSON.parse(JSON.stringify(window.SEED||{}));
  const seedC=(S.cards||[]).map(c=>({...c,u:1}));
  const contas=(S.contas||[]).map((c,i)=>({id:c.id||'s'+i,n:c.n,d:c.d||'',card:c.card||'',v:c.v||{},o:{},p:c.p||{},i,u:1}));
  const meses={};for(const k in (S.meses||{}))meses[k]={e:S.meses[k].e||0,a:S.meses[k].a??null,u:1};
  return {v:1,cards:seedC,meses,contas,eventos:[],tarefas:[],notas:[]};
}
let CFG=lg('as_cfg',{});           // {token, repo}  (só neste aparelho)
let D=lg('as_data',null)||newData();
let SHA=lg('as_sha',null),ETAG=null;
const UI=lg('as_ui',{tone:0});
function ensureShape(){for(const k of['cards','contas','eventos','tarefas','notas'])if(!Array.isArray(D[k]))D[k]=[];if(!D.meses)D.meses={}}
ensureShape();
function mergeList(a=[],b=[]){const m=new Map();for(const it of a)m.set(it.id,it);
  for(const it of b){const o=m.get(it.id);if(!o||(it.u||0)>(o.u||0))m.set(it.id,it)}
  const cut=nowT()-30*864e5;return[...m.values()].filter(it=>!(it.x&&(it.u||0)<cut))}
function mergeObj(a={},b={}){const r={...a};for(const k in b)if(!r[k]||(b[k].u||0)>(r[k].u||0))r[k]=b[k];return r}
function mergeData(a,b){return{v:1,cards:mergeList(a.cards,b.cards),meses:mergeObj(a.meses,b.meses),contas:mergeList(a.contas,b.contas),eventos:mergeList(a.eventos,b.eventos),tarefas:mergeList(a.tarefas,b.tarefas),notas:mergeList(a.notas,b.notas)}}
function persist(){ls('as_data',D)}
function touch(it){it.u=nowT();dirty();return it}
function dirty(){persist();ls('as_dirty',1);if(CFG.token)clearTimeout(dirty.t),dirty.t=setTimeout(push,700);setSt()}

/* ===== sincronização com o GitHub ===== */
const API=()=>`https://api.github.com/repos/${CFG.repo}/contents/dados.json`;
const hdr=x=>({Authorization:'Bearer '+CFG.token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...x});
let ST='off',busy=false,again=false,lastErr='';
function setSt(s){if(s)ST=s;const b=$('#sync');if(!b)return;
  let st=ST;if(st==='ok'&&lg('as_dirty',0))st='pend';
  const map={ok:['check','ok','Sincronizado'],pend:['refresh','sy','Alterações pendentes'],sync:['refresh','sy','Sincronizando…'],off:['cloud-off','','Sem conexão ou sem token'],err:['cloud-off','er','Erro: '+lastErr]};
  const m=map[st]||map.off;b.className='ib '+m[1];b.title=m[2];b.innerHTML=`<svg class="ic"><use href="#i-${m[0]}"/></svg>`}
async function pull(quiet){
  if(!CFG.token)return;
  try{
    const h=hdr();if(ETAG&&SHA)h['If-None-Match']=ETAG;
    const r=await fetch(API(),{headers:h,cache:'no-store'});
    if(r.status===304){setSt('ok');return 'same'}
    if(r.status===404){SHA=null;ls('as_sha',null);ls('as_dirty',1);return 'new'}
    if(r.status===401||r.status===403){lastErr=r.status===401?'token inválido ou expirado':'sem permissão';setSt('err');return 'auth'}
    if(!r.ok)throw new Error('HTTP '+r.status);
    const j=await r.json();SHA=j.sha;ls('as_sha',SHA);ETAG=r.headers.get('etag');
    const remote=JSON.parse(b64d(j.content));
    const before=canon(D);D=mergeData(D,remote);ensureShape();persist();
    if(canon(D)!==canon(remote))ls('as_dirty',1);else ls('as_dirty',0);
    setSt('ok');
    if(canon(D)!==before)softRender();
    return 'ok';
  }catch(e){lastErr=String(e.message||e);setSt(navigator.onLine?'err':'off');return 'fail'}
}
async function push(){
  if(!CFG.token)return;
  if(busy){again=true;return}
  busy=true;setSt('sync');
  try{
    const st=await pull();
    if(st==='auth'||st==='fail')return;
    if(!lg('as_dirty',0)){setSt('ok');return}
    for(let t=0;t<4;t++){
      const body={message:'sync '+new Date().toISOString(),content:b64e(JSON.stringify(D))};
      if(SHA)body.sha=SHA;
      const r=await fetch(API(),{method:'PUT',headers:hdr({'Content-Type':'application/json'}),body:JSON.stringify(body)});
      if(r.ok){const j=await r.json();SHA=j.content.sha;ls('as_sha',SHA);ETAG=null;ls('as_dirty',0);setSt('ok');return}
      if(r.status===409||r.status===422){ETAG=null;SHA=null;const s2=await pull();if(s2==='auth'||s2==='fail')return;continue}
      if(r.status===401||r.status===403){lastErr='sem permissão de escrita';setSt('err');return}
      throw new Error('HTTP '+r.status);
    }
    lastErr='conflito repetido';setSt('err');
  }catch(e){lastErr=String(e.message||e);setSt(navigator.onLine?'err':'off')}
  finally{busy=false;if(again){again=false;setTimeout(push,300)}}
}
async function testToken(repo,token){
  const r=await fetch(`https://api.github.com/repos/${repo}`,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
  if(r.status===404)throw new Error('Repositório não encontrado (confira o nome e as permissões do token).');
  if(r.status===401)throw new Error('Token inválido ou expirado.');
  if(!r.ok)throw new Error('Erro '+r.status+' ao falar com o GitHub.');
}

/* ===== regras de negócio ===== */
function rangeM(){const ks=new Set(Object.keys(D.meses));D.contas.forEach(c=>{if(!c.x)for(const k in c.v)ks.add(k)});
  const y=new Date().getFullYear();ks.add(y+'-01');ks.add(y+'-12');const a=[...ks].sort();const r=[];let k=a[0];while(k<=a[a.length-1]){r.push(k);k=addM(k,1)}return r}
function calc(){const R={};let prev=0;for(const k of rangeM()){const m=D.meses[k]||{};const e=m.e||0;const ov=m.a!=null;const so=ov?m.a:prev;
  let d=0;for(const c of D.contas)if(!c.x)d+=c.v[k]||0;const sd=Math.round((so+e-d)*100)/100;R[k]={e,so,ov,d,sd};prev=sd}return R}
const live=a=>a.filter(x=>!x.x);
const cardOf=c=>c.card?D.cards.find(x=>x.id===c.card&&!x.x):null;
function dueDay(c){const cd=cardOf(c);if(cd)return cd.due;const m=/dia\s*(\d{1,2})/i.exec(c.d||'')||/^\s*(\d{1,2})\s*$/.exec(c.d||'');return m?+m[1]:null}
function occurs(ev,d){
  if(ev.x||d<ev.s)return false;if(ev.e&&d>ev.e)return false;if((ev.ex||[]).includes(d))return false;
  const r=ev.r||'none';if(r==='none')return d===ev.s;
  const diff=Math.round((pd(d)-pd(ev.s))/864e5);
  if(r==='day')return true;if(r==='week')return diff%7===0;if(r==='biweek')return diff%14===0;
  if(r==='month'){const[y,m,dd]=d.split('-').map(Number);const sd=+ev.s.slice(8);return dd===Math.min(sd,dim(y,m))}
  return false}
function itemsOn(d,flt){
  const out=[];
  if(flt!=='p')for(const ev of live(D.eventos))if(occurs(ev,d))out.push({k:'e',ev,d,h:ev.h||'99'});
  if(flt!=='e'){const[y,m,dd]=d.split('-').map(Number);const k=y+'-'+pad(m);
    for(const c of live(D.contas)){const amt=c.v[k];if(!(amt>0))continue;const day=dueDay(c);if(day==null)continue;
      if(Math.min(day,dim(y,m))===dd)out.push({k:'p',c,amt,paid:!!c.p[k],d,h:'98'})}}
  return out.sort((a,b)=>a.h<b.h?-1:a.h>b.h?1:0)}
function faturaKeys(card,date,rule,n){
  const[y,m,dd]=date.split('-').map(Number);const closesNow=rule==='proxima'?dd<card.close:dd<=card.close;
  const cm=closesNow?y+'-'+pad(m):addM(y+'-'+pad(m),1);
  const due=addM(cm,card.due>card.close?0:1);return Array.from({length:n},(_,i)=>addM(due,i))}
function ensureM(k){if(!D.meses[k])D.meses[k]={e:0,a:null};return D.meses[k]}
function cardRow(card){let c=D.contas.find(x=>!x.x&&x.card===card.id);
  if(!c){c={id:uid(),n:card.n,d:'',card:card.id,v:{},o:{},p:{},i:D.contas.length};D.contas.push(c)}return c}
function usedOf(card){const k0=mk(today());let s=0;for(const c of live(D.contas))if(c.card===card.id)for(const k in c.v)if(k>=k0)s+=c.v[k]||0;return s}

/* ===== estado de tela ===== */
let T=lg('as_tab','hoje');let HO=0,CF='all',AGM=mk(today()),AGS=today(),TF='all',FM=mk(today()),FE=false;
let NOTE=null,NOTEPANE='l',UNDO=null,toastT;
const TABS=[['hoje','Hoje','sun'],['comp','Compromissos','calendar-event'],['agenda','Agenda','calendar-month'],['tar','Tarefas','checklist'],['notas','Notas','notes'],['fin','Finanças','wallet']];
const TAGS=['Geral','Casa','Finanças','Compras','Trabalho'];
const REC={none:'Não repete',day:'Todo dia',week:'Toda semana',biweek:'A cada 15 dias',month:'Todo mês'};
const ico=n=>`<svg class="ic"><use href="#i-${n}"/></svg>`;
const isPh=()=>matchMedia('(max-width:760px)').matches;

/* ===== views ===== */
function hojeLabel(o){return o===0?'Hoje':o===1?'Amanhã':o===2?'Depois de amanhã':o===-1?'Ontem':o===-2?'Anteontem':dbr(addD(today(),o))}
function evRow(it,cls=''){
  if(it.k==='e')return `<div class="row ${cls}" role="button" data-a="ev-edit" data-id="${it.ev.id}"><span class="h">${esc(it.ev.h||'dia todo')}</span><span class="t">${esc(it.ev.t)}</span>${it.ev.r&&it.ev.r!=='none'?ico('repeat'):''}<button class="xb" data-a="ev-del" data-id="${it.ev.id}" data-d="${it.d}" title="Excluir">${ico('trash')}</button></div>`;
  return `<div class="row ${cls} ${it.paid?'pd':''}"><span class="h">${ico('cash')}</span><span class="t">${esc(it.c.n)}${it.c.card?'':''}</span><span class="v">${brl(it.amt)}</span><button class="ck ${it.paid?'on':''}" data-a="pay" data-id="${it.c.id}" data-k="${mk(it.d)}" title="Marcar como pago">${ico('check')}</button></div>`}
function taskRow(t){return `<div class="row ${t.s?'pd':''}"><button class="ck ${t.s?'on':''}" data-a="tk-toggle" data-id="${t.id}">${ico('check')}</button><span class="t">${esc(t.n)}</span>${t.d?`<span class="sub">${dbr(t.d)}</span>`:''}<span class="tg">${esc(t.l||'Geral')}</span><button class="xb" data-a="tk-del" data-id="${t.id}">${ico('trash')}</button></div>`}
function vHoje(){
  const d=addD(today(),HO),dt=pd(d);const its=itemsOn(d);
  const tk=live(D.tarefas).filter(t=>!t.s).sort((a,b)=>(a.d||'9')<(b.d||'9')?-1:1);
  return `<div class="w"><div class="hd"><button class="ib" data-a="hnav" data-n="-1">${ico('chevron-left')}</button><div><h2>${hojeLabel(HO)}</h2><div class="sub">${DOW[dt.getDay()]}, ${dbr(d)}</div></div><button class="ib" data-a="hnav" data-n="1">${ico('chevron-right')}</button><span class="sp"></span><button class="bt pr" data-a="ev-new" data-d="${d}">${ico('plus')}Compromisso</button></div>
  <div class="sec">Compromissos</div>${its.length?its.map(i=>evRow(i)).join(''):'<div class="empty">Nada marcado para este dia.</div>'}
  <div class="sec">Tarefas</div>${tk.length?tk.map(taskRow).join(''):'<div class="empty">Nenhuma tarefa aberta.</div>'}</div>`}
function vComp(){
  const t0=today();let days='';
  for(let i=0;i<45;i++){const d=addD(t0,i);const its=itemsOn(d,CF==='all'?undefined:CF);if(!its.length)continue;
    days+=`<div class="dh">${i===0?'Hoje':i===1?'Amanhã':DOW[pd(d).getDay()]} <small>${dbr(d)}</small></div>`+its.map(x=>evRow(x,i===0?'today':'')).join('')}
  return `<div class="w"><div class="hd"><h2>Compromissos</h2><div class="chips">${[['all','Todos'],['e','Eventos'],['p','Pagamentos']].map(([k,l])=>`<button class="chip ${CF===k?'on':''}" data-a="cf" data-v="${k}">${l}</button>`).join('')}</div><span class="sp"></span><button class="bt sm" data-a="tab" data-v="agenda">${ico('calendar-month')}Agenda</button><button class="bt pr sm" data-a="ev-new" data-d="${t0}">${ico('plus')}Novo</button></div>
  ${days||'<div class="empty">Nenhum compromisso nos próximos 45 dias.</div>'}</div>`}
function vAgenda(){
  const[y,m]=AGM.split('-').map(Number);const first=new Date(y,m-1,1).getDay();const n=dim(y,m);const t0=today();
  let cells=DOW.map(x=>`<div class="cw">${x.slice(0,3)}</div>`).join('');
  const start=addD(AGM+'-01',-first);
  for(let i=0;i<42;i++){const d=addD(start,i);if(i>=35&&mk(d)!==AGM)break;const its=itemsOn(d);
    cells+=`<div class="cd ${mk(d)!==AGM?'o':''} ${d===t0?'td':''} ${d===AGS?'sl':''}" role="button" data-a="agsel" data-d="${d}"><b>${+d.slice(8)}</b>${its.slice(0,2).map(x=>`<span class="ev ${x.k==='p'?'p':''}">${esc(x.k==='e'?x.ev.t:x.c.n)}</span>`).join('')}${its.length>2?`<span class="sub">+${its.length-2}</span>`:''}<span class="dots">${its.slice(0,5).map(x=>`<i class="${x.k==='p'?'p':''}"></i>`).join('')}</span></div>`}
  const sel=itemsOn(AGS);
  return `<div class="ag"><div><div class="hd"><div><h2 style="font-size:18px">${DOW[pd(AGS).getDay()]}</h2><div class="sub">${dbr(AGS)}</div></div><span class="sp"></span><button class="bt pr sm" data-a="ev-new" data-d="${AGS}">${ico('plus')}Evento</button></div>${sel.length?sel.map(i=>evRow(i)).join(''):'<div class="empty">Dia livre.</div>'}</div>
  <div class="cal-col"><div class="hd"><button class="ib" data-a="agm" data-n="-1">${ico('chevron-left')}</button><h2 style="font-size:18px;min-width:150px;text-align:center">${MESL[m-1]} ${y}</h2><button class="ib" data-a="agm" data-n="1">${ico('chevron-right')}</button></div><div class="cal">${cells}</div></div></div>`}
function vTar(){
  const all=live(D.tarefas).filter(t=>TF==='all'||t.l===TF);
  const op=all.filter(t=>!t.s).sort((a,b)=>(a.d||'9')<(b.d||'9')?-1:1),dn=all.filter(t=>t.s);
  return `<div class="w"><div class="hd"><h2>Tarefas</h2><div class="chips">${['all',...TAGS].map(k=>`<button class="chip ${TF===k?'on':''}" data-a="tkf" data-v="${k}">${k==='all'?'Todas':k}</button>`).join('')}</div></div>
  <form data-form="tarefa" class="box" style="display:grid;grid-template-columns:1fr 130px 140px auto;gap:8px;margin-bottom:12px"><input type="text" name="n" placeholder="Nova tarefa…" required><select name="l">${TAGS.map(t=>`<option>${t}</option>`).join('')}</select><input type="date" name="d"><button class="bt pr" type="submit">${ico('plus')}Adicionar</button></form>
  ${op.length?op.map(taskRow).join(''):'<div class="empty">Nada pendente.</div>'}${dn.length?`<div class="sec">Concluídas</div>`+dn.map(taskRow).join(''):''}</div>`}
function noteSel(){return NOTE}
function vNotas(){
  const ns=live(D.notas).sort((a,b)=>(b.p?1:0)-(a.p?1:0)||(b.u||0)-(a.u||0));
  const N=NOTE;
  const list=ns.map(n=>`<div class="ni ${N&&N.id===n.id?'on':''}" role="button" data-a="note-open" data-id="${n.id}"><b>${n.p?'📌 ':''}${esc(n.t||'Sem título')}</b><span>${esc((n.c||'').split('\n')[0])}</span></div>`).join('')||'<div class="empty">Nenhuma nota.</div>';
  const ed=N?`<input type="text" id="nt-t" placeholder="Título" value="${esc(N.t)}"><textarea id="nt-c" placeholder="Escreva aqui…">${esc(N.c)}</textarea><div class="ma" style="margin:0"><button class="bt sm" data-a="note-back" style="margin-right:auto" id="nb">${ico('chevron-left')}Voltar</button><button class="bt sm" data-a="note-pin">${ico('pin')}${N.p?'Desafixar':'Fixar'}</button>${N.id?`<button class="bt sm dn" data-a="note-del">${ico('trash')}Excluir</button>`:''}<button class="bt pr sm" data-a="note-save">Salvar nota</button></div>`:'<div class="empty">Selecione ou crie uma nota.</div>';
  return `<div class="w" style="max-width:1100px"><div class="hd"><h2>Notas</h2><span class="sp"></span><button class="bt pr sm" data-a="note-new">${ico('plus')}Nova nota</button></div><div class="nt ${N?'e':'l'}"><div class="nl">${list}</div><div class="ne">${ed}</div></div></div>`}
function valCell(c,k){const v=c.v[k];const pg=c.p[k];
  return `<td class="m"><div class="vc"><button class="ck ${pg?'on':''}" data-a="pay" data-id="${c.id}" data-k="${k}" ${v>0?'':'style="visibility:hidden"'}>${ico('check')}</button><input type="text" inputmode="decimal" class="in ${v>0?(pg?'pg':'up'):''} ${c.o[k]?'ov':''}" data-f="v" data-id="${c.id}" data-k="${k}" value="${v==null?'':nf(v)}"></div></td>`}
function vFin(){
  const R=calc(),M=rangeM(),cur=mk(today());const cs=live(D.contas).sort((a,b)=>(a.i||0)-(b.i||0));
  const head=`<div class="hd"><h2>Finanças</h2><span class="sp"></span><button class="bt sm" data-a="gasto">${ico('credit-card')}Gastos do dia</button><button class="bt sm" data-a="conta-new">${ico('plus')}Conta</button></div>`;
  const cardsH=`<div class="sec">Cartões</div><div class="cards">${live(D.cards).map(c=>`<div class="box cc" role="button" data-a="card-edit" data-id="${c.id}"><b>${esc(c.n)}</b><span>fecha dia ${c.close} · vence dia ${c.due}</span><em>${brl(usedOf(c))}</em><span>fatura + parcelas a partir deste mês</span></div>`).join('')}</div>`;
  /* celular */
  const r=R[FM]||{e:0,so:0,d:0,sd:0};
  const ph=`<div class="ph"><div class="hd"><button class="ib" data-a="fm" data-n="-1">${ico('chevron-left')}</button><h2 style="flex:1;text-align:center;font-size:18px">${MESL[+FM.slice(5)-1]} ${FM.slice(0,4)}</h2><button class="ib" data-a="fm" data-n="1">${ico('chevron-right')}</button></div>
   <div class="sm4"><div><small>Entrada</small><input type="text" inputmode="decimal" data-f="e" data-k="${FM}" value="${nf(r.e)}"></div><div><small>Sobrou do mês passado</small><input type="text" inputmode="decimal" data-f="a" data-k="${FM}" value="${nf(r.so)}"></div><div><small>Despesas</small><b style="font-size:16px">${brl(r.d)}</b></div><div><small>Saldo total</small><b style="font-size:16px;color:${r.sd<0?'var(--dn)':'var(--ok)'}">${brl(r.sd)}</b></div></div>
   <div class="hd"><button class="bt sm" data-a="gasto">${ico('credit-card')}Gastos do dia</button><button class="bt sm" data-a="conta-new">${ico('plus')}Conta</button><span class="sp"></span><button class="bt sm ${FE?'pr':''}" data-a="fin-edit">${ico('pencil')}${FE?'Pronto':'Editar'}</button></div>
   <div class="box" style="padding:0">${cs.map(c=>{const v=c.v[FM],pg=c.p[FM],dd=dueDay(c);return `<div class="ct"><div class="n">${esc(c.n)}${dd?`<small>dia ${dd}</small>`:''}</div>${FE?`<button class="xb" data-a="conta-edit" data-id="${c.id}">${ico('pencil')}</button>`:`<input type="text" inputmode="decimal" class="in ${v>0?(pg?'pg':'up'):''} ${c.o[FM]?'ov':''}" data-f="v" data-id="${c.id}" data-k="${FM}" value="${v==null?'':nf(v)}"><button class="ck ${pg?'on':''}" data-a="pay" data-id="${c.id}" data-k="${FM}" ${v>0?'':'style="visibility:hidden"'}>${ico('check')}</button>`}</div>`}).join('')||'<div class="empty" style="border:0">Nenhuma conta ainda.</div>'}</div></div>`;
  /* desktop */
  const th=M.map(k=>`<th class="${k===cur?'cur':''}" data-k="${k}">${mlab(k)}</th>`).join('');
  const rowE=`<tr><td class="s1">Entrada</td><td class="s2"></td><td class="s3"></td>${M.map(k=>`<td class="m"><div class="vc"><input type="text" inputmode="decimal" class="in" data-f="e" data-k="${k}" value="${R[k].e?nf(R[k].e):''}"></div></td>`).join('')}</tr>`;
  const rowS=`<tr><td class="s1">Sobrou do mês passado</td><td class="s2"></td><td class="s3"></td>${M.map(k=>`<td class="m"><div class="vc"><input type="text" inputmode="decimal" class="in ${R[k].ov?'ov':'pg'}" data-f="a" data-k="${k}" value="${nf(R[k].so)}"></div></td>`).join('')}</tr>`;
  const rows=cs.map(c=>{const cd=cardOf(c),dd=dueDay(c);return `<tr><td class="s1">${esc(c.n)}<button class="ed" data-a="conta-edit" data-id="${c.id}" title="Editar conta">${ico('pencil')}</button></td><td class="s2">${dd?'dia '+dd:esc(c.d||'')}</td><td class="s3">${cd?esc(cd.n):''}</td>${M.map(k=>valCell(c,k)).join('')}</tr>`}).join('');
  const rowD=`<tr class="sum"><td class="s1">Despesas</td><td class="s2"></td><td class="s3"></td>${M.map(k=>`<td class="m" style="text-align:right;padding:0 10px">${nf(R[k].d)}</td>`).join('')}</tr>`;
  const rowT=`<tr class="sum"><td class="s1">Saldo total</td><td class="s2"></td><td class="s3"></td>${M.map(k=>`<td class="m" style="text-align:right;padding:0 10px;color:${R[k].sd<0?'var(--dn)':'var(--ok)'}">${nf(R[k].sd)}</td>`).join('')}</tr>`;
  const dk=`<div class="dk">${head}<div class="mx" id="mx"><table class="sh"><thead><tr><th class="s1">Conta</th><th class="s2">Venc.</th><th class="s3">Cartão</th>${th}</tr></thead><tbody>${rowE}${rowS}${rows}${rowD}${rowT}</tbody></table></div></div>`;
  return (isPh()?'':dk)+(isPh()?ph:'')+cardsH}
const VIEWS={hoje:vHoje,comp:vComp,agenda:vAgenda,tar:vTar,notas:vNotas,fin:vFin};

let firstFin=true;
function render(){
  const mx=$('#mx');const sl=mx?mx.scrollLeft:null,st=mx?mx.scrollTop:null;
  const nav=TABS.map(([k,l,i])=>`<button class="tb ${T===k?'on':''}" data-a="tab" data-v="${k}">${ico(i)}${l}</button>`).join('');
  $('#tabs').innerHTML=nav;$('#bnav').innerHTML=nav;
  $('#main').innerHTML=VIEWS[T]();
  const m2=$('#mx');
  if(m2){if(sl!=null&&!firstFin){m2.scrollLeft=sl;m2.scrollTop=st}else{const th=m2.querySelector('th.cur');if(th)m2.scrollLeft=Math.max(0,th.offsetLeft-(parseInt(getComputedStyle(document.documentElement).getPropertyValue('--w1'))||200)-190);firstFin=false}}
  setSt();
}
let pendingRender=false;
function softRender(){const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&$('#main').contains(a)){pendingRender=true;return}if(!$('#modal').hidden)return;render()}
function fitCol1(){const c=document.createElement('canvas').getContext('2d');c.font='13px system-ui';let w=0;for(const x of live(D.contas))w=Math.max(w,c.measureText(x.n).width);document.documentElement.style.setProperty('--w1',Math.max(200,Math.min(320,Math.ceil(w)+52))+'px')}
function go(t){T=t;ls('as_tab',t);if(t==='fin')firstFin=true;fitCol1();render();scrollTo(0,0)}

/* ===== modais ===== */
function modal(html){const m=$('#modal');m.innerHTML=`<div class="md" role="dialog">${html}</div>`;m.hidden=false;const f=m.querySelector('input:not([type=hidden]),textarea');if(f&&!isPh())f.focus()}
function closeM(){$('#modal').hidden=true;$('#modal').innerHTML='';if(pendingRender){pendingRender=false}render()}
function toast(msg,undo){const t=$('#toast');t.innerHTML=`<span>${esc(msg)}</span>${undo?'<button data-a="undo">Desfazer</button>':''}`;t.hidden=false;clearTimeout(toastT);toastT=setTimeout(()=>{t.hidden=true},undo?9000:2500)}
function mEvento(id,d){const ev=id?D.eventos.find(e=>e.id===id):null;
  modal(`<h3>${ev?'Editar compromisso':'Novo compromisso'}</h3><form data-form="evento"><input type="hidden" name="id" value="${ev?ev.id:''}"><label class="fl"><small>Título</small><input type="text" name="t" required value="${esc(ev?ev.t:'')}"></label><div class="f2"><label class="fl"><small>Data</small><input type="date" name="s" required value="${ev?ev.s:d}"></label><label class="fl"><small>Hora (opcional)</small><input type="time" name="h" value="${ev?ev.h||'':''}"></label></div><div class="f2"><label class="fl"><small>Repetir</small><select name="r">${Object.entries(REC).map(([k,l])=>`<option value="${k}" ${ev&&ev.r===k?'selected':''}>${l}</option>`).join('')}</select></label><label class="fl"><small>Repetir até (opcional)</small><input type="date" name="e" value="${ev?ev.e||'':''}"></label></div><div class="ma"><button type="button" class="bt" data-a="close">Cancelar</button><button class="bt pr" type="submit">Salvar</button></div></form>`)}
function mDelEv(id,d){const ev=D.eventos.find(e=>e.id===id);if(!ev)return;
  if(!ev.r||ev.r==='none')return modal(`<h3>Excluir compromisso?</h3><p>${esc(ev.t)}</p><div class="ma"><button class="bt" data-a="close">Cancelar</button><button class="bt dn" data-a="ev-dm" data-m="all" data-id="${id}" data-d="${d}">Excluir</button></div>`);
  modal(`<h3>Excluir compromisso recorrente</h3><p>${esc(ev.t)} — ${REC[ev.r].toLowerCase()}</p><div class="ma col"><button class="bt" data-a="ev-dm" data-m="one" data-id="${id}" data-d="${d}">Só este dia (${dbr(d)})</button><button class="bt" data-a="ev-dm" data-m="next" data-id="${id}" data-d="${d}">Este e os próximos</button><button class="bt dn" data-a="ev-dm" data-m="all" data-id="${id}" data-d="${d}">Todos os dias da série</button><button class="bt" data-a="close">Cancelar</button></div>`)}
function mConta(id){const c=id?D.contas.find(x=>x.id===id):null;
  modal(`<h3>${c?'Editar conta':'Nova conta'}</h3><form data-form="conta"><input type="hidden" name="id" value="${c?c.id:''}"><label class="fl"><small>Nome</small><input type="text" name="n" required value="${esc(c?c.n:'')}"></label><div class="f2"><label class="fl"><small>Vencimento (ex.: dia 10)</small><input type="text" name="d" value="${esc(c?c.d||'':'')}"></label><label class="fl"><small>Cartão (opcional)</small><select name="card"><option value="">—</option>${live(D.cards).map(k=>`<option value="${k.id}" ${c&&c.card===k.id?'selected':''}>${esc(k.n)}</option>`).join('')}</select></label></div><div class="ma">${c?`<button type="button" class="bt dn" data-a="conta-del" data-id="${c.id}" style="margin-right:auto">Excluir</button>`:''}<button type="button" class="bt" data-a="close">Cancelar</button><button class="bt pr" type="submit">Salvar</button></div></form>`)}
function mCard(id){const c=D.cards.find(x=>x.id===id);
  modal(`<h3>${esc(c.n)}</h3><form data-form="card"><input type="hidden" name="id" value="${c.id}"><div class="f2"><label class="fl"><small>Dia de fechamento</small><input type="text" inputmode="numeric" name="close" value="${c.close}"></label><label class="fl"><small>Dia de vencimento</small><input type="text" inputmode="numeric" name="due" value="${c.due}"></label></div><div class="ma"><button type="button" class="bt" data-a="close">Cancelar</button><button class="bt pr" type="submit">Salvar</button></div></form>`)}
function gastoPrev(f){const card=D.cards.find(x=>x.id===f.card.value);const v=parseNum(f.v.value);const n=+f.n.value||1;if(!card||!v||v<=0)return 'Informe cartão e valor.';
  const ks=faturaKeys(card,f.d.value,f.rule.value,n);const tot=f.mode.value==='total'||n===1?v:v*n;
  return n===1?`Entra na fatura que vence em ${mlab(ks[0])} (dia ${card.due}).`:`${n}× de ${brl(f.mode.value==='total'?v/n:v)} — de ${mlab(ks[0])} a ${mlab(ks[n-1])} (total ${brl(tot)}).`}
function mGasto(){const cards=live(D.cards);
  modal(`<h3>Gastos do dia</h3><form data-form="gasto" id="gf"><label class="fl"><small>Cartão</small><select name="card">${cards.map(c=>`<option value="${c.id}">${esc(c.n)}</option>`).join('')}</select></label><div class="f2"><label class="fl"><small>Data da compra</small><input type="date" name="d" required value="${today()}"></label><label class="fl"><small>Valor (R$)</small><input type="text" inputmode="decimal" name="v" required placeholder="0,00"></label></div><div class="f2"><label class="fl"><small>Parcelas</small><select name="n">${Array.from({length:24},(_,i)=>`<option>${i+1}</option>`).join('')}</select></label><label class="fl"><small>O valor é…</small><select name="mode"><option value="total">Total</option><option value="parcela">Valor da parcela</option></select></label></div><label class="fl"><small>Compra no dia do fechamento vai para a fatura…</small><select name="rule"><option value="atual">atual (que fecha nesse dia)</option><option value="proxima">próxima</option></select></label><div class="pv" id="gp">Informe cartão e valor.</div><div class="ma"><button type="button" class="bt" data-a="close">Cancelar</button><button class="bt pr" type="submit">Lançar</button></div></form>`)}
function mSettings(){
  modal(`<h3>Ajustes</h3><div class="sub" style="margin-bottom:10px">${lg('as_dirty',0)?'Há alterações ainda não enviadas.':'Tudo sincronizado.'}${ST==='err'?' Erro: '+esc(lastErr):''}</div>
  <div class="ma col" style="margin:0 0 14px"><button class="bt" data-a="sync">${ico('refresh')}Sincronizar agora</button><button class="bt" data-a="backup">${ico('download')}Baixar backup (.json)</button></div>
  <label class="fl"><small>Tom do fundo</small><input type="range" min="0" max="100" value="${UI.tone||0}" id="tone"></label>
  <form data-form="token"><label class="fl"><small>Repositório de dados</small><input type="text" name="repo" value="${esc(CFG.repo||'')}"></label><label class="fl"><small>Trocar token (deixe vazio para manter)</small><input type="password" name="token" autocomplete="off" placeholder="github_pat_…"></label><div class="ma"><button class="bt dn" type="button" data-a="logout" style="margin-right:auto">${ico('logout')}Sair deste aparelho</button><button class="bt" type="button" data-a="close">Fechar</button><button class="bt pr" type="submit">Salvar</button></div></form>`)}
function mConfirm(msg,act,id){modal(`<h3>${esc(msg)}</h3><div class="ma"><button class="bt" data-a="close">Cancelar</button><button class="bt dn" data-a="${act}" data-id="${id}">Excluir</button></div>`)}
function loginView(err=''){
  $('#tabs').innerHTML='';$('#bnav').innerHTML='';
  $('#main').innerHTML=`<div class="login box"><h2 style="margin-top:0">Assistente</h2><p>Para sincronizar entre seus aparelhos, cole o token do GitHub (ele fica só neste navegador).</p><ol><li>GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token</li><li>Repositório: somente <b>assistente-dados</b>; permissão <b>Contents: Read and write</b>; defina uma validade.</li></ol><form data-form="login"><label class="fl"><small>Repositório de dados</small><input type="text" name="repo" value="${esc(CFG.repo||'joshpunk-JL/assistente-dados')}"></label><label class="fl"><small>Token</small><input type="password" name="token" autocomplete="off" placeholder="github_pat_…" required></label><button class="bt pr" type="submit">Entrar</button><div class="err">${esc(err)}</div></form><p class="sub">Sem token o app funciona só neste aparelho, sem sincronizar. <a href="#" data-a="local">Usar sem sincronizar</a></p></div>`}

/* ===== ações ===== */
const A={
  tab:t=>go(t.dataset.v),
  hnav:t=>{HO+=+t.dataset.n;render()},
  cf:t=>{CF=t.dataset.v;render()},
  agm:t=>{AGM=addM(AGM,+t.dataset.n);render()},
  agsel:t=>{AGS=t.dataset.d;AGM=mk(AGS);render()},
  fm:t=>{FM=addM(FM,+t.dataset.n);render()},
  'fin-edit':()=>{FE=!FE;render()},
  tkf:t=>{TF=t.dataset.v;render()},
  'ev-new':t=>mEvento(null,t.dataset.d),
  'ev-edit':(t,e)=>{if(e.target.closest('[data-a=ev-del]'))return;mEvento(t.dataset.id)},
  'ev-del':(t,e)=>{e.stopPropagation();mDelEv(t.dataset.id,t.dataset.d)},
  'ev-dm':t=>{const ev=D.eventos.find(x=>x.id===t.dataset.id),d=t.dataset.d,m=t.dataset.m;if(!ev)return;
    if(m==='one'){ev.ex=[...(ev.ex||[]),d]}
    else if(m==='next'){if(d<=ev.s)ev.x=1;else ev.e=addD(d,-1)}
    else ev.x=1;
    touch(ev);closeM()},
  pay:(t,e)=>{e.stopPropagation();const c=D.contas.find(x=>x.id===t.dataset.id),k=t.dataset.k;if(c.p[k])delete c.p[k];else c.p[k]=1;touch(c);render()},
  'tk-toggle':t=>{const x=D.tarefas.find(i=>i.id===t.dataset.id);x.s=x.s?0:1;touch(x);render()},
  'tk-del':t=>{const x=D.tarefas.find(i=>i.id===t.dataset.id);x.x=1;touch(x);render()},
  'note-new':()=>{NOTE={id:null,t:'',c:'',p:0};render()},
  'note-open':t=>{const n=D.notas.find(x=>x.id===t.dataset.id);NOTE={id:n.id,t:n.t,c:n.c,p:n.p};render()},
  'note-back':()=>{NOTE=null;render()},
  'note-pin':()=>{grabNote();NOTE.p=NOTE.p?0:1;render()},
  'note-save':()=>{grabNote();if(!NOTE.t&&!NOTE.c)return;
    let n=NOTE.id&&D.notas.find(x=>x.id===NOTE.id);
    if(!n){n={id:uid(),t:'',c:'',p:0};D.notas.push(n);NOTE.id=n.id}
    n.t=NOTE.t;n.c=NOTE.c;n.p=NOTE.p;touch(n);toast('Nota salva');render()},
  'note-del':()=>mConfirm('Excluir esta nota?','note-del2',NOTE.id),
  'note-del2':t=>{const n=D.notas.find(x=>x.id===t.dataset.id);if(n){n.x=1;touch(n)}NOTE=null;closeM()},
  'conta-new':()=>mConta(null),
  'conta-edit':t=>mConta(t.dataset.id),
  'conta-del':t=>{const c=D.contas.find(x=>x.id===t.dataset.id);c.x=1;touch(c);fitCol1();closeM()},
  'card-edit':t=>mCard(t.dataset.id),
  gasto:()=>{mGasto();$('#gp').textContent=gastoPrev($('#gf'))},
  undo:()=>{if(!UNDO)return;const u=UNDO;UNDO=null;
    for(const s of u){const c=D.contas.find(x=>x.id===s.id);if(!c)continue;if(s.created){c.x=1}else{c.v=s.v;c.o=s.o}touch(c)}
    $('#toast').hidden=true;render()},
  close:()=>closeM(),
  settings:()=>mSettings(),
  sync:async()=>{await push();mSettings()},
  backup:()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(D,null,1)],{type:'application/json'}));a.download='assistente-backup-'+today()+'.json';a.click()},
  logout:()=>{CFG={repo:CFG.repo};ls('as_cfg',CFG);ls('as_sha',null);SHA=null;ST='off';closeM();loginView()},
  local:e=>{CFG.local=1;ls('as_cfg',CFG);boot2()}
};
function grabNote(){const t=$('#nt-t'),c=$('#nt-c');if(t)NOTE.t=t.value;if(c)NOTE.c=c.value}
const F={
  evento:(f)=>{const id=f.get('id');let ev=id&&D.eventos.find(x=>x.id===id);if(!ev){ev={id:uid(),ex:[]};D.eventos.push(ev)}
    ev.t=f.get('t').trim();ev.s=f.get('s');ev.h=f.get('h')||'';ev.r=f.get('r');ev.e=f.get('e')||'';
    if(ev.e&&ev.e<ev.s)ev.e='';touch(ev);if(T==='agenda'){AGS=ev.s;AGM=mk(ev.s)}closeM()},
  tarefa:(f,form)=>{const t={id:uid(),n:f.get('n').trim(),l:f.get('l'),d:f.get('d')||'',s:0};if(!t.n)return;D.tarefas.push(t);touch(t);render()},
  conta:(f)=>{const id=f.get('id');let c=id&&D.contas.find(x=>x.id===id);if(!c){c={id:uid(),v:{},o:{},p:{},i:D.contas.length};D.contas.push(c)}
    c.n=f.get('n').trim();c.d=f.get('d').trim();c.card=f.get('card')||'';touch(c);fitCol1();closeM()},
  card:(f)=>{const c=D.cards.find(x=>x.id===f.get('id'));const a=parseInt(f.get('close')),b=parseInt(f.get('due'));
    if(a>=1&&a<=31)c.close=a;if(b>=1&&b<=31)c.due=b;touch(c);closeM()},
  gasto:(f,form)=>{const card=D.cards.find(x=>x.id===f.get('card'));const v=parseNum(f.get('v'));const n=+f.get('n')||1;if(!card||!(v>0))return;
    const ks=faturaKeys(card,f.get('d'),f.get('rule'),n);
    const per=f.get('mode')==='parcela'||n===1?(n===1?v:v):Math.floor(v/n*100)/100;
    const amts=ks.map((_,i)=>f.get('mode')==='parcela'||n===1?v:(i===n-1?Math.round((v-per*(n-1))*100)/100:per));
    const before=D.contas.find(x=>!x.x&&x.card===card.id);const row=cardRow(card);
    UNDO=[{id:row.id,created:!before,v:{...row.v},o:{...row.o}}];
    ks.forEach((k,i)=>{ensureM(k);D.meses[k].u=nowT();row.v[k]=Math.round(((row.v[k]||0)+amts[i])*100)/100;row.o[k]=1});
    touch(row);fitCol1();closeM();toast(`Lançado em ${card.n}: ${n>1?n+'× ':''}${brl(amts[0])}`,true)},
  token:async(f)=>{const repo=f.get('repo').trim(),tok=f.get('token').trim()||CFG.token;
    try{await testToken(repo,tok)}catch(e){toast(e.message);return}
    CFG={...CFG,repo,token:tok};ls('as_cfg',CFG);SHA=null;ETAG=null;closeM();push()},
  login:async(f)=>{const repo=f.get('repo').trim(),tok=f.get('token').trim();
    try{await testToken(repo,tok)}catch(e){loginView(e.message);return}
    CFG={repo,token:tok};ls('as_cfg',CFG);boot2()}
};
document.addEventListener('click',e=>{const t=e.target.closest('[data-a]');if(t&&A[t.dataset.a]){if(t.tagName==='A')e.preventDefault();A[t.dataset.a](t,e);return}
  if(e.target.id==='modal')closeM()});
document.addEventListener('submit',e=>{const f=e.target.closest('form[data-form]');if(!f)return;e.preventDefault();F[f.dataset.form]?.(new FormData(f),f)});
document.addEventListener('input',e=>{if(e.target.id==='tone'){UI.tone=+e.target.value;ls('as_ui',UI);document.body.style.setProperty('--tone',UI.tone)}
  if(e.target.closest('#gf'))$('#gp').textContent=gastoPrev($('#gf'))});
document.addEventListener('change',e=>{
  if(e.target.closest('#gf')){$('#gp').textContent=gastoPrev($('#gf'));return}
  const i=e.target;if(!i.dataset||!i.dataset.f)return;const k=i.dataset.k,f=i.dataset.f;const val=parseNum(i.value);
  if(val===undefined){render();return}
  if(f==='v'){const c=D.contas.find(x=>x.id===i.dataset.id);const had=c.v[k]!=null;if(val==null||val===0&&i.value.trim()==='')delete c.v[k];else c.v[k]=val;if(had&&val!=null)c.o[k]=1;touch(c)}
  else{const m=ensureM(k);if(f==='e')m.e=val||0;else m.a=val;m.u=nowT();dirty()}
  render()});
document.addEventListener('focusout',()=>{setTimeout(()=>{if(pendingRender&&!(document.activeElement&&/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName))){pendingRender=false;render()}},50)});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('#modal').hidden)closeM();if(e.key==='Enter'&&e.target.dataset&&e.target.dataset.f)e.target.blur()});
matchMedia('(max-width:760px)').addEventListener('change',()=>{if($('#main').innerHTML)render()});
addEventListener('online',()=>push());addEventListener('offline',()=>setSt('off'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&CFG.token)lg('as_dirty',0)?push():pull()});
setInterval(()=>{if(!document.hidden&&CFG.token&&!busy)lg('as_dirty',0)?push():pull()},60000);

function boot2(){document.body.style.setProperty('--tone',UI.tone||0);fitCol1();render();if(CFG.token)push()}
(function boot(){
  if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{});
  document.body.style.setProperty('--tone',UI.tone||0);
  if(!CFG.token&&!CFG.local){loginView();return}
  boot2();
})();
