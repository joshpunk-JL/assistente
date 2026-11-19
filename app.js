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
const ml=k=>MES[+k.slice(5)-1].toLowerCase()+'/'+k.slice(2,4);
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
  const contas=(S.contas||[]).map((c,i)=>({id:c.id||'s'+i,n:c.n,d:c.d||'',c:c.c||null,card:c.card||'',v:c.v||{},o:{},p:c.p||{},i,u:1}));
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
function setSt(s){if(s)ST=s;const b=$('#bd');if(!b)return;
  let st=ST;if(!CFG.token)st='local';else if(st==='ok'&&lg('as_dirty',0))st='pend';
  const map={ok:['circle-check','var(--text-success)','Salvo e sincronizado'],pend:['refresh','','Salvando…'],sync:['refresh','','Salvando…'],off:['cloud-off','','Sem conexão'],local:['cloud-off','','Só neste aparelho'],err:['cloud-off','var(--text-danger)','Erro de sincronização']};
  const m=map[st]||map.off;b.title=st==='err'?lastErr:m[2];b.innerHTML=ic(m[0],14,m[1])+'<span class="bdt"> '+m[2]+'</span>'}
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
const r2=n=>Math.round(n*100)/100;
const live=a=>a.filter(x=>!x.x);
const CCOL={nu:'#7F77DD',cc:'#D85A30',xp:'#EF9F27',am:'#BA7517',ml:'#378ADD'};
const PAL=['#EF9F27','#7F77DD','#D85A30','#378ADD','#BA7517','#1D9E75','#D4537E','#888780'];
const ccol=c=>c.c||CCOL[c.id]||'#888780';
const cardOf=c=>c.card?D.cards.find(x=>x.id===c.card&&!x.x):null;
const rowCol=c=>c.c||(cardOf(c)?ccol(cardOf(c)):null);
function ensureM(k){let m=D.meses[k];if(!m||m.x){m=D.meses[k]={e:0,a:null,u:nowT()}}return m}
function rangeM(){const ks=new Set(Object.keys(D.meses).filter(k=>!D.meses[k].x));live(D.contas).forEach(c=>{for(const k in c.v)ks.add(k)});if(!ks.size)ks.add(mk(today()));const a=[...ks].sort();const r=[];let k=a[0];while(k<=a[a.length-1]){r.push(k);k=addM(k,1)}return r}
function calc(){const R={};let prev=0;for(const k of rangeM()){const m=D.meses[k]||{};const e=m.e||0;const ov=m.a!=null;const so=ov?m.a:prev;
  let d=0,pg=0,pf=0;for(const c of live(D.contas)){const v=c.v[k]||0;if(c.p[k]===2){pf+=v;continue}d+=v;if(c.p[k])pg+=v}const sd=r2(so+e-d);R[k]={e,so,ov,d:r2(d),pg:r2(pg),pf:r2(pf),sd};prev=sd}return R}
function dueDay(c){const cd=cardOf(c);if(cd)return cd.due;const m=/dia\s*(\d{1,2})/i.exec(c.d||'')||/^\s*(\d{1,2})\s*$/.exec(c.d||'');return m?+m[1]:null}
function occurs(ev,d){
  if(ev.x||d<ev.s)return false;if(ev.e&&d>ev.e)return false;if((ev.ex||[]).includes(d))return false;
  const r=ev.r||'none';if(r==='none')return d===ev.s;
  const diff=Math.round((pd(d)-pd(ev.s))/864e5);
  if(r==='day')return true;if(r==='week')return diff%7===0;if(r==='biweek')return diff%14===0;
  if(r==='month'){const[y,m,dd]=d.split('-').map(Number);return dd===Math.min(+ev.s.slice(8),dim(y,m))}
  return false}
function items(d,hide){
  const out=[],[y,m,dd]=d.split('-').map(Number),k=y+'-'+pad(m);
  live(D.contas).forEach(c=>{const amt=c.v[k];if(!(amt>0))return;const day=dueDay(c);if(day==null||Math.min(day,dim(y,m))!==dd)return;const paid=!!c.p[k];if(hide&&paid)return;
    out.push({v:1,t:'',n:(c.card?'Fatura ':'')+c.n,dk:d,id:c.id,paid,st:c.p[k],amt})});
  live(D.eventos).filter(e=>occurs(e,d)).sort((a,b)=>(a.h||'')<(b.h||'')?-1:1).forEach(e=>out.push({v:0,t:e.h||'',n:e.t,dk:d,id:e.id,rec:e.r&&e.r!=='none'}));
  return out}
function faturaKeys(card,date,rule,n){
  const[y,m,dd]=date.split('-').map(Number);const closesNow=rule==='proxima'?dd<card.close:dd<=card.close;
  const cm=closesNow?y+'-'+pad(m):addM(y+'-'+pad(m),1);
  const due=addM(cm,card.due>card.close?0:1);return Array.from({length:n},(_,i)=>addM(due,i))}
function cardRow(card){let c=D.contas.find(x=>!x.x&&x.card===card.id);
  if(!c){c={id:uid(),n:card.n,d:'',c:null,card:card.id,v:{},o:{},p:{},i:Math.max(-1,...D.contas.map(x=>x.i||0))+1};D.contas.push(c)}return c}
function usedOf(card){const k0=mk(today());let s=0;for(const c of live(D.contas))if(c.card===card.id)for(const k in c.v)if(k>=k0)s+=c.v[k]||0;return r2(s)}
const isEd=(c,k)=>c.o&&c.o[k]!==undefined&&r2(c.o[k])!==r2(c.v[k]||0);

/* ===== estado de tela ===== */
const WS=['dom','seg','ter','qua','qui','sex','sáb'];
const WF=['domingo','segunda-feira','terça-feira','quarta-feira','quinta-feira','sexta-feira','sábado'];
const WH=['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];
const MFl=MESL.map(x=>x.toLowerCase());
const TB=[['hoje','home','Hoje'],['comp','list-details','Compromissos'],['agenda','calendar','Agenda'],['tar','checkbox','Tarefas'],['notas','note','Notas'],['fin','wallet','Finanças']];
const TG={'Trabalho':['var(--bg-accent)','var(--text-accent)'],'Casa':['var(--bg-success)','var(--text-success)'],'Finanças':['var(--bg-warning)','var(--text-warning)'],'Compras':['var(--bg-pro)','var(--text-pro)'],'Geral':['var(--surface-1)','var(--text-secondary)']};
const TL=['Geral','Casa','Finanças','Compras','Trabalho'];
const RED='var(--text-danger)',BLU='var(--text-accent)',AMB='var(--text-warning)',GRN='var(--text-success)';
UI.tone=UI.tone??6;UI.w=UI.w||{};
const S={t:lg('as_tab','hoje'),hd:0,fm:'e',av:'mes',sel:today(),ref:today(),ne:0,nerr:'',nh:'',nm:'00',nn:'',nr:'none',nu:'',rd:'',rch:'one',dc:'',tl:'Todas',te:null,no:null,nd:0,q:'',gm:0,g:{k:'',v:'',par:0,n:12,mode:'tot',dia:0},gerr:'',ok:'',cr:'atual',fsub:'plan',dd:null,pk:null,err:'',set:0,fm2:mk(today()),fe:0,fc:1,o:'',md:null,pc:''};
let LAN=[];
const isPh=()=>matchMedia('(max-width:760px)').matches;
const ic=(n,s=16,c)=>`<svg class="ic" width="${s}" height="${s}" style="${c?'color:'+c:''}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const bt=(a,i,label,cls,icon,extra)=>`<div class="bt${cls?' '+cls:''}" data-a="${a}"${i!=null?` data-i="${esc(i)}"`:''}${extra||''} role="button">${icon?ic(icon,15):''}${label||''}</div>`;
const ibt=(a,i,icon,label,cls,col)=>`<div class="bt ic${cls?' '+cls:''}" data-a="${a}"${i!=null?` data-i="${esc(i)}"`:''} role="button" aria-label="${label}">${ic(icon,16,col)}</div>`;
const tag=(l,a,i)=>{const c=TG[l]||TG.Geral;return `<span class="tg"${a?` data-a="${a}" data-i="${esc(i)}"`:''} style="background:${c[0]};color:${c[1]}">${esc(l)}</span>`};
const REC={day:'Todos os dias',week:'Toda semana',biweek:'A cada 15 dias',month:'Todo mês'};
const ws=d=>addD(d,-((pd(d).getDay()+6)%7));
function recOpts(d){const dt=pd(d),w=WF[dt.getDay()],fem=dt.getDay()>=1&&dt.getDay()<=5;return[['none','Não se repete'],['day','Todos os dias'],['week',(fem?'Toda ':'Todo ')+w],['biweek','A cada 15 dias'],['month','Todo mês, no dia '+dt.getDate()]]}
const nmx=x=>esc(x.n)+(x.rec?` <span title="Compromisso recorrente">${ic('repeat',13,'var(--text-muted)')}</span>`:'');
const pn=s=>{const v=parseNum(s);return v==null||v===undefined?0:v};
const pv=s=>{const n=pn(s);return n>0?n:0};
const openT=()=>live(D.tarefas).filter(t=>!t.d).sort((a,b)=>(b.s||0)-(a.s||0));
const pdate=()=>S.g.dia?addD(today(),-1):today();

const vin=x=>x.v?`<input class="f2 pv" type="text" inputmode="decimal" data-c="${x.id}|${mk(x.dk)}" value="${nf(x.amt)}" aria-label="Valor da conta" title="Alterar o valor muda também a planilha de Finanças">`:'';
const LEG='<p class="sm" style="font-size:11px;margin:10px 0 0">Check dos pagamentos: 1º clique <b style="font-weight:500;color:var(--text-success)">verde</b> = pago desta conta (desconta do saldo); 2º clique <b style="font-weight:500;color:var(--text-accent)">azul</b> = pago de outra conta (não desconta); 3º clique volta para a pagar. O valor pode ser alterado aqui e muda também em Finanças.</p>';
const pst=x=>x.paid?'color:var(--text-secondary);text-decoration:line-through;':'';
function act(x){
  if(x.v){const key=x.dk+'|'+x.id;return `<span data-a="ppay" data-i="${key}" role="button" aria-label="Alternar: a pagar, pago desta conta, pago de outra conta" style="display:flex;cursor:pointer;padding:2px">${ic(x.paid?'circle-check':'circle',24,x.paid?(x.st===2?BLU:GRN):RED)}</span>`}
  const key=x.dk+'|'+x.id;
  if(S.dc===key)return bt('edel',key,'Excluir?','dg sm3');
  return ibt('edel',key,'trash','Excluir compromisso','sm2',RED)}
function modalRD(){
  if(!S.rd)return '';const[date,id]=S.rd.split('|'),e=D.eventos.find(x=>x.id===id);if(!e)return '';
  const O=[['one','Só este compromisso'],['next','Este e os próximos'],['all','Todos os compromissos da série']];
  let h=`<div class="ov"><div class="md"><p style="font-size:16px;font-weight:500;margin:0 0 4px">Excluir compromisso recorrente</p><p class="sm" style="margin:0 0 10px">${esc(e.t)}, ${(REC[e.r]||'').toLowerCase()}. Você abriu o dia ${dbr(date).slice(0,5)}.</p>`;
  O.forEach(o=>{h+=`<div class="op" data-a="rdsel" data-i="${o[0]}">${ic(S.rch===o[0]?'circle-dot':'circle',20,S.rch===o[0]?BLU:'var(--text-muted)')}<span>${o[1]}</span></div>`});
  return h+`<div class="sg" style="justify-content:flex-end;margin-top:12px">${bt('rdno',null,'Cancelar')}${bt('rdok',null,'Excluir','dg')}</div></div></div>`}
function modalMD(){
  if(!S.md)return '';const k=S.md;
  return `<div class="ov"><div class="md"><p style="font-size:16px;font-weight:500;margin:0 0 4px">Excluir ${mlab(k)}?</p><p class="sm" style="margin:0 0 12px">Os valores, a entrada e as marcações de pago deste mês serão apagados, em todos os aparelhos. O saldo dos meses seguintes é recalculado.</p><div class="sg" style="justify-content:flex-end">${bt('mdno',null,'Cancelar')}${bt('mdok',k,'Excluir','dg')}</div></div></div>`}
function modalSet(){
  if(!S.set)return '';
  return `<div class="ov"><div class="md"><p style="font-size:16px;font-weight:500;margin:0 0 4px">Ajustes <span class="sm">· versão 13</span></p><p class="sm" style="margin:0 0 12px">${!CFG.token?'Sem sincronização: os dados ficam só neste aparelho.':lg('as_dirty',0)?'Há alterações ainda não enviadas.':'Tudo sincronizado.'}${ST==='err'?' Erro: '+esc(lastErr):''}</p>
  <div class="sg" style="margin-bottom:14px">${bt('sync',null,'Sincronizar agora','','refresh')}${bt('backup',null,'Baixar backup','','download')}${DEF&&!standalone()?bt('install',null,'Instalar no computador','sa','download'):''}</div>${!standalone()&&!DEF?'<p class="sm" style="margin:-4px 0 12px;font-size:12px">Para instalar como app: no Chrome ou Edge, clique no ícone de instalar na barra de endereço (ou menu ⋮ → Salvar e compartilhar → Instalar página como app). No iPhone: Compartilhar → Adicionar à Tela de Início.</p>':''}
  <form data-form="token"><label class="fl"><small>Repositório de dados</small><input class="f2" type="text" name="repo" value="${esc(CFG.repo||'joshpunk-JL/assistente-dados')}"></label><label class="fl"><small>${CFG.token?'Trocar token (deixe vazio para manter)':'Token do GitHub'}</small><input class="f2" type="password" name="token" autocomplete="off" placeholder="github_pat_…"></label><p class="err" id="seterr"></p><div class="sg" style="justify-content:flex-end;margin-top:12px">${CFG.token?bt('logout',null,'Sair deste aparelho','dg','logout','style="margin-right:auto"'):''}${bt('setclose',null,'Fechar')}<button class="bt sa" type="submit">Salvar</button></div></form></div></div>`}

function gpHtml(){
  const g=S.g;if(!g.k)return '<span class="sm">Escolha o cartão para ver em qual fatura a compra cai.</span>';
  const card=D.cards.find(c=>c.id===g.k),n=g.par?g.n:1,ks=faturaKeys(card,pdate(),S.cr==='prox'?'proxima':'atual',n),amt=pv(g.v);
  let h=`Cai na fatura de <b style="font-weight:500">${ml(ks[0])}</b>, vence dia ${card.due}.`;
  if(g.par&&amt){const tt=g.mode==='par'?amt*n:amt,per=r2(tt/n);h+=` <span class="sm">${n} parcelas de ${rs(per)}, de ${ml(ks[0])} a ${ml(ks[n-1])}. Total ${rs(tt)}.</span>`}
  return h}
const rs=n=>(n<0?'−':'')+'R$ '+nf(Math.abs(n));
function gform(){
  const g=S.g,t=today(),y=addD(t,-1);
  let h=`<div class="cd2" style="margin-bottom:14px;border-color:var(--border-accent)"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><b style="font-weight:500;font-size:15px">Gasto no cartão</b>${ibt('gclose',null,'x','Fechar')}</div><p class="sm" style="margin:0 0 5px">Cartão</p><div class="sg" style="margin-bottom:12px">`;
  live(D.cards).forEach(c=>{h+=bt('gcard',c.id,`<span class="dot" style="background:${ccol(c)}"></span>${esc(c.n)}`,g.k===c.id?'sa':'')});
  h+=`</div><div style="display:flex;gap:16px;flex-wrap:wrap;align-items:flex-end;margin-bottom:12px"><div style="width:150px"><p class="sm" style="margin:0 0 5px">Valor</p><input class="f2" id="gv" type="text" inputmode="decimal" placeholder="0,00" value="${esc(g.v)}"></div>`;
  h+=`<div><p class="sm" style="margin:0 0 5px">Pagamento</p><div class="sg">${bt('gpar',0,'À vista',!g.par?'sa':'')}${bt('gpar',1,'Parcelado',g.par?'sa':'')}</div></div>`;
  if(g.par){let o='';for(let i=2;i<=24;i++)o+=`<option value="${i}"${g.n===i?' selected':''}>${i}x</option>`;
    h+=`<div><p class="sm" style="margin:0 0 5px">Parcelas</p><div class="sg" style="flex-wrap:nowrap"><select class="f2" id="gn" style="width:80px">${o}</select>${bt('gmode','tot','Total',g.mode==='tot'?'sa':'')}${bt('gmode','par','Parcela',g.mode==='par'?'sa':'')}</div></div>`}
  h+=`<div><p class="sm" style="margin:0 0 5px">Data da compra</p><div class="sg">${bt('gdia',0,'Hoje, '+dbr(t).slice(0,5),!g.dia?'sa':'')}${bt('gdia',1,'Ontem, '+dbr(y).slice(0,5),g.dia?'sa':'')}</div></div></div>`;
  if(g.par)h+=`<p class="sm" style="margin:-4px 0 10px">${g.mode==='tot'?'O valor digitado é o total da compra.':'O valor digitado é o de cada parcela.'}</p>`;
  return h+`<div class="mini" id="gp" style="margin-bottom:8px">${gpHtml()}</div><p id="ge" style="font-size:12px;color:var(--text-danger);margin:0 0 8px">${S.gerr}</p><div class="sg">${bt('gclose',null,'Cancelar')}${bt('glan',null,'Lançar','sa')}</div></div>`}
function dayTitle(o,d){if(o===0)return 'Hoje';if(o===1)return 'Amanhã';if(o===2)return 'Depois de amanhã';if(o===-1)return 'Ontem';if(o===-2)return 'Anteontem';return dbr(d)}

/* ===== telas ===== */
function vHoje(){
  const d=addD(today(),S.hd),dt=pd(d),it=items(d,false);
  let h=`<div class="ctr"><div class="hgrid"><span class="sm">${WF[dt.getDay()]}, ${dt.getDate()} de ${MFl[dt.getMonth()]}</span><div style="display:flex;align-items:center;gap:12px">${ibt('hprev',null,'chevron-left','Dia anterior')}<span style="min-width:150px;text-align:center;font-size:22px;font-weight:500">${dayTitle(S.hd,d)}</span>${ibt('hnext',null,'chevron-right','Próximo dia')}</div><div style="text-align:right">${bt('gopen',null,'Gastos do dia','','credit-card')}</div></div>`;
  if(S.gm)h+=gform();
  if(S.ok)h+=`<div class="cd2" style="margin-bottom:14px;border-color:var(--border-success);display:flex;align-items:center;gap:10px;padding:10px 14px">${ic('circle-check',18,GRN)}<span style="flex:1;font-size:13px">${esc(S.ok)}</span>${LAN.length?bt('gundo',null,'Desfazer'):''}</div>`;
  h+=`<div class="col"><div class="cd2"><p style="font-size:14px;font-weight:500;margin:0 0 8px">${ic('calendar',16)} Compromissos ${S.hd===0?'de hoje':'do dia'}</p>`;
  if(!it.length)h+=`<p class="sm" style="margin:0">Nada marcado ${S.hd===0?'para hoje':'neste dia'}.</p>`;
  it.forEach(x=>{h+=`<div class="rw2" style="cursor:default"><span class="sm" style="width:48px">${x.v?'pagar':(x.t||'dia todo')}</span><span style="flex:1;min-width:0;font-size:13px;${pst(x)}">${nmx(x)}</span>${x.v?ic('wallet',16,RED):''}${vin(x)}${act(x)}</div>`});
  const o=openT(),top=o.slice(0,8);
  h+=`</div><div class="cd2"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px"><span style="font-size:14px;font-weight:500">${ic('checkbox',16)} Tarefas (${o.length})</span><span data-a="tab" data-i="tar" style="font-size:12px;color:var(--text-accent);cursor:pointer">Ver todas</span></div>`;
  top.forEach(x=>{h+=`<div class="rw2" data-a="tdone" data-i="${x.id}">${ic('circle',20,'var(--text-muted)')}<span style="flex:1;min-width:0;font-size:13px">${esc(x.n)}</span>${tag(x.l)}${x.s?ic('star',15,AMB):''}</div>`});
  if(o.length>8)h+=`<p class="sm" style="margin:6px 0 0">e mais ${o.length-8} tarefas</p>`;
  if(!top.length)h+='<p class="sm" style="margin:4px 0 0">Tudo feito por aqui.</p>';
  return h+'</div></div>'+LEG+'</div>'}
function vComp(){
  const F=[['e','Compromissos','var(--text-accent)'],['v','Pagamentos','var(--text-danger)'],['all','Todos','']],t0=today();
  let h=`<div class="ctr"><div style="display:flex;align-items:flex-end;gap:28px;margin-bottom:12px;flex-wrap:wrap"><div><p class="h1">Compromissos</p><p class="sm" style="margin:2px 0 0">Próximos 30 dias</p></div><div class="sg">`;
  F.forEach(f=>{h+=bt('flt',f[0],(f[2]?`<span class="dot" style="background:${f[2]};width:7px;height:7px"></span>`:'')+f[1],S.fm===f[0]?'sa':'')});
  h+='</div></div><div class="lh"><span>Data</span><span>Hora</span><span>Descrição</span><span></span></div>';
  let n=0;
  for(let i=0;i<30;i++){const d=addD(t0,i),dt=pd(d);items(d,false).forEach(x=>{
    if(S.fm==='e'&&x.v)return;if(S.fm==='v'&&!x.v)return;n++;
    if(isPh()){const key=d+'-'+n,op=S.o===key;h+=`<div class="rw2" data-a="open" data-i="${key}" style="align-items:flex-start;gap:8px">${x.v?ic('wallet',15,RED):ic('clock',15,BLU)}<div style="flex:1;min-width:0"><div class="ln${op?' op':''}" style="${pst(x)}"><span style="color:var(--text-secondary)">${WS[dt.getDay()]}, ${dbr(d).slice(0,5)} – ${x.v?'pagar':(x.t||'dia todo')} – </span>${nmx(x)}</div>${op?`<div style="margin-top:6px">${bt('goto',d,'Abrir na agenda','sm3')}</div>`:''}</div>${vin(x)}${act(x)}</div>`;return}
    h+=`<div class="lr${i===0?' tdy':''}"><span style="color:var(--text-secondary)">${WS[dt.getDay()]}, ${dbr(d).slice(0,5)}</span><span>${x.v?'pagar':(x.t||'dia todo')}</span><span style="display:flex;align-items:center;gap:8px;min-width:0">${x.v?ic('wallet',16,RED):ic('clock',16,BLU)}<span style="min-width:0;${pst(x)}">${nmx(x)}</span></span><span style="display:flex;gap:6px;justify-content:flex-end;align-items:center">${bt('goto',d,'Agenda','sm3 gotob')}${vin(x)}${act(x)}</span></div>`})}
  if(!n)h+='<p class="sm" style="padding:12px 4px">Nada para mostrar neste filtro.</p>';
  return h+'<p class="sm" style="margin:10px 0 0;font-size:11px">Os itens de hoje ficam em cinza mais claro. Lixeira apaga o compromisso, também na agenda.</p>'+LEG+'</div>'}
function chips(d){const it=items(d,false);let h='',dots='';
  it.slice(0,3).forEach(x=>{h+=`<div class="chip ${x.v?'cv':'ce'}" style="${x.paid?'opacity:.5;text-decoration:line-through':''}">${x.v?'pagar ':(x.t?x.t+' ':'')}${esc(x.n)}</div>`});
  if(it.length>3)h+=`<div class="sm" style="font-size:11px;margin-top:3px">+${it.length-3} mais</div>`;
  it.slice(0,5).forEach(x=>{dots+=`<i class="${x.v?'v':''}"></i>`});
  return h+`<div class="dots">${dots}</div>`}
const cellW=(d,out)=>`<div class="cc${out?' out':''}${d===S.sel?' sel':''}${d===today()?' tdy':''}" data-a="aday" data-i="${d}"><span class="dn">${+d.slice(8)}</span>${chips(d)}</div>`;
function vAgenda(){
  let title,grid=`<div class="cal${S.av==='sem'?' wk':''}">`;
  WH.forEach(w=>{grid+=`<div class="ch">${w}</div>`});
  if(S.av==='mes'){const f=mk(S.ref)+'-01',st=ws(f),fd=pd(f),len=dim(fd.getFullYear(),fd.getMonth()+1),rows=Math.ceil(((fd.getDay()+6)%7+len)/7);
    title=MFl[fd.getMonth()]+' de '+fd.getFullYear();
    for(let i=0;i<rows*7;i++){const d=addD(st,i);grid+=cellW(d,mk(d)!==mk(f))}}
  else{const a=ws(S.ref),b=addD(a,6),pa=pd(a),pb=pd(b);
    title=(pa.getMonth()===pb.getMonth()?pa.getDate()+' a '+pb.getDate()+' de '+MFl[pa.getMonth()]:pa.getDate()+' de '+MFl[pa.getMonth()]+' a '+pb.getDate()+' de '+MFl[pb.getMonth()])+' de '+pb.getFullYear();
    for(let j=0;j<7;j++)grid+=cellW(addD(a,j),false)}
  grid+='</div>';
  const sd=pd(S.sel);
  let h=`<div class="pn2"><div class="col"><div style="display:flex;align-items:center;gap:8px"><p class="h1" style="flex:1">Agenda</p>${bt('atoday',null,'Hoje','sm3')}</div><div style="display:flex;align-items:center;gap:8px">${ibt('aprev',null,'chevron-left','Anterior')}<span style="flex:1;min-width:0;text-align:center;font-size:14px;font-weight:500">${title}</span>${ibt('anext',null,'chevron-right','Próximo')}</div><div class="sg">${bt('avw','mes','Mês',S.av==='mes'?'sa':'')}${bt('avw','sem','Semana',S.av==='sem'?'sa':'')}</div>`;
  const it=items(S.sel,false);
  h+=`<div class="cd2"><p style="font-size:14px;font-weight:500;margin:0 0 8px">${WF[sd.getDay()]}, ${sd.getDate()} de ${MFl[sd.getMonth()]}</p>`;
  if(!it.length)h+='<p class="sm" style="margin:0 0 8px">Nada marcado neste dia.</p>';
  it.forEach(x=>{h+=`<div class="rw2" style="cursor:default">${x.v?ic('wallet',16,x.paid?'var(--text-muted)':RED):ic('clock',16,BLU)}<div style="flex:1;min-width:0;font-size:13px;${x.paid?'color:var(--text-secondary);text-decoration:line-through':''}">${nmx(x)}<div class="sm" style="font-size:11px">${x.v?(x.paid?(x.st===2?'Pago de outra conta':'Pago desta conta'):'Pagar'):(x.t||'Dia todo')}</div></div>${vin(x)}${act(x)}</div>`});
  if(S.ne){let op='';recOpts(S.sel).forEach(o=>{op+=`<option value="${o[0]}"${S.nr===o[0]?' selected':''}>${o[1]}</option>`});
    h+=`<div style="margin-top:10px;border-top:.5px solid var(--border);padding-top:10px"><p style="font-size:13px;font-weight:500;margin:0 0 6px">Novo compromisso</p><div style="display:flex;gap:6px;margin-bottom:6px"><div style="display:flex;gap:4px;flex:0 0 auto"><select class="f2" id="nvh" aria-label="Hora" style="width:96px"><option value="">Dia todo</option>${Array.from({length:24},(_,i)=>`<option value="${i}"${S.nh!==''&&+S.nh===i?' selected':''}>${pad(i)}h</option>`).join('')}</select><select class="f2" id="nvm" aria-label="Minutos" style="width:70px"${S.nh===''?' disabled':''}>${['00','15','30','45'].map(m=>`<option value="${m}"${S.nm===m?' selected':''}>${m}</option>`).join('')}</select></div></div><textarea class="f2" id="nvn" rows="3" placeholder="Compromisso" style="margin-bottom:6px;resize:vertical">${esc(S.nn)}</textarea><div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">${ic('repeat',16,'var(--text-secondary)')}<select class="f2" id="nvr">${op}</select></div>`;
    if(S.nr!=='none')h+=`<input class="f2" id="nve" type="text" placeholder="Repetir até dd/mm/aaaa (opcional)" value="${esc(S.nu)}" style="margin-bottom:6px!important">`;
    h+=`<p style="font-size:12px;color:var(--text-danger);margin:0 0 6px">${S.nerr}</p><div class="sg">${bt('ecancel',null,'Cancelar')}${bt('esave',null,'Salvar','sa')}</div></div>`}
  else h+=`<div style="margin-top:10px">${bt('enew',null,'Novo compromisso','','plus')}</div>`;
  h+=`</div></div><div class="calc">${grid}<p class="sm" style="font-size:11px;margin:8px 0 0"><span class="dot" style="background:var(--text-accent);width:7px;height:7px"></span> compromisso &nbsp; <span class="dot" style="background:var(--text-danger);width:7px;height:7px"></span> pagamento &nbsp; ${ic('repeat',12,'var(--text-muted)')} recorrente. Clique em um dia para ver e editar ao lado.</p>${LEG}</div></div>`;
  return h}
function vTar(){
  const L=['Todas',...TL];
  let h=`<div class="ctr"><p class="h1" style="margin-bottom:10px">Tarefas</p><div style="display:flex;gap:8px;margin-bottom:6px"><input class="f2" id="nt" type="text" placeholder="Nova tarefa">${ibt('tadd',null,'plus','Adicionar tarefa','')}</div><p style="font-size:12px;color:var(--text-danger);margin:0 0 6px">${S.err}</p><div class="sg" style="margin-bottom:12px">`;
  L.forEach(l=>{h+=bt('tl',l,l,S.tl===l?'sa':'')});
  h+='</div>';
  const o=openT().filter(t=>S.tl==='Todas'||t.l===S.tl),dn=live(D.tarefas).filter(t=>t.d&&(S.tl==='Todas'||t.l===S.tl));
  h+=`<p class="sm" style="font-weight:500;margin:0 0 2px">A fazer (${o.length})</p>`;
  o.forEach(t=>{h+=`<div style="border-top:.5px solid var(--border)"><div class="rw2" style="border-top:0"><span data-a="tdone" data-i="${t.id}" style="display:flex;cursor:pointer">${ic('circle',22,'var(--text-muted)')}</span><span data-a="tdone" data-i="${t.id}" style="flex:1;font-size:14px">${esc(t.n)}</span>${tag(t.l,'tagopen',t.id)}<span data-a="tstar" data-i="${t.id}" style="display:flex;cursor:pointer">${ic('star',19,t.s?AMB:'var(--text-muted)')}</span></div>`;
    if(S.te===t.id){h+='<div class="sg" style="padding:0 0 8px 32px">';TL.forEach(l=>{h+=`<span style="${t.l===l?'outline:1.5px solid var(--border-accent);border-radius:8px;':''}">${tag(l,'tagset',t.id+'|'+l)}</span>`});h+='</div>'}h+='</div>'});
  if(!o.length)h+='<p class="sm" style="margin:6px 0">Nenhuma tarefa aberta aqui.</p>';
  if(dn.length){h+=`<p class="sm" style="font-weight:500;margin:14px 0 2px">Concluídas (${dn.length})</p>`;dn.forEach(t=>{h+=`<div class="rw2" data-a="tdone" data-i="${t.id}">${ic('circle-check',22,GRN)}<span style="flex:1;font-size:14px;color:var(--text-secondary);text-decoration:line-through">${esc(t.n)}</span></div>`});h+=`<div style="margin-top:10px">${bt('clr',null,'Limpar concluídas')}</div>`}
  return h+'<p class="sm" style="font-size:11px;margin:12px 0 0">Tarefa nova entra como Geral. Clique na etiqueta para trocar. A estrela põe a tarefa no topo.</p></div>'}
function nlist(){
  const q=S.q.toLowerCase(),r=live(D.notas).filter(n=>!q||((n.t||'')+' '+(n.c||'')).toLowerCase().includes(q)).sort((a,b)=>(b.p||0)-(a.p||0)||(b.u||nowT())-(a.u||nowT()));
  let h='';r.forEach(n=>{h+=`<div class="rw2" data-a="nopen" data-i="${n.id}" style="padding:10px 8px;border-radius:8px;${S.no===n.id?'background:var(--bg-accent)':''}"><span style="flex:1;min-width:0;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(n.t||'Sem título')}</span><span data-a="npin" data-i="${n.id}" style="display:flex;padding:2px" aria-label="Fixar no topo">${ic('pin',18,n.p?BLU:'var(--text-muted)')}</span></div>`});
  return r.length?h:'<p class="sm" style="margin:8px 0">Nenhuma nota encontrada.</p>'}
function vNotas(){
  const n=S.no&&D.notas.find(x=>x.id===S.no&&!x.x);
  let h=`<p class="h1" style="margin-bottom:10px">Notas</p><div class="np ${n?'e':'l'}"><div class="cd2 nlist"><input class="f2" id="sq" type="text" placeholder="Buscar nas notas" value="${esc(S.q)}" style="margin-bottom:8px!important"><div id="nl">${nlist()}</div><div style="margin-top:10px">${bt('nnew',null,'Nova nota','','plus')}</div><p class="sm" style="font-size:11px;margin:8px 0 0">Notas fixadas ficam no topo.</p></div>`;
  if(n){h+=`<div class="cd2 ncard"><div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">${bt('nback',null,'Voltar','phn','chevron-left')}<span style="flex:1"></span>${bt('npin',n.id,n.p?'Desafixar':'Fixar',n.p?'sa':'','pin')}${bt('ndel',null,'Excluir','dg','trash')}</div>`;
    if(S.nd)h+=`<div class="cd2" style="border-color:var(--border-danger);margin-bottom:10px;display:flex;align-items:center;gap:10px"><span style="flex:1;font-size:13px">Excluir esta nota?</span>${bt('ndelok',null,'Excluir','dg')}${bt('ndelno',null,'Cancelar')}</div>`;
    h+=`<input class="f2" id="ntt" type="text" placeholder="Título" value="${esc(n.t)}" style="font-weight:500;margin-bottom:8px!important"><textarea class="f2" id="ntc" rows="14" placeholder="Escreva aqui">${esc(n.c)}</textarea><div style="margin-top:10px">${bt('nsave',null,'Salvar nota','sa','check')}</div></div>`}
  else h+='<div class="cd2 ncard" style="min-height:240px;display:flex;align-items:center;justify-content:center"><span class="sm">Selecione uma nota ou crie uma nova.</span></div>';
  return h+'</div>'}

/* planilha */
let W={},FIT=false;
function mw(txt,size,weight){const s=$('#msr'),ref=document.querySelector('.in.r')||document.body,cs=getComputedStyle(ref);s.style.fontFamily=cs.fontFamily;s.style.fontSize=size+'px';s.style.fontWeight=weight||400;s.textContent=txt;return s.getBoundingClientRect().width}
function fitW(k){
  const cs=live(D.contas),R=calc(),cw=mw('0',13);let w=0;
  if(k==='t')return 34;
  if(k==='c'){cs.forEach(c=>{w=Math.max(w,mw(c.n,13))});return Math.max(170,Math.min(380,Math.ceil(w+22+4+8+18)))}
  if(k==='v'){cs.forEach(c=>{w=Math.max(w,mw(dueTxt(c),12))});return Math.max(78,Math.ceil(w+2*cw+14))}
  let wi=0;cs.forEach(c=>{wi=Math.max(wi,mw(nf(c.v[k]||0),13,500))});const r=R[k]||{e:0,so:0,d:0,sd:0};
  wi=Math.max(wi,mw(nf(r.e),14),mw(nf(r.so),12),mw(nf(r.d),13));
  const n1=wi+2*cw+12+8+24+4,n2=mw(nf(r.sd),16,500)+cw+34+8,n3=Math.max(mw('Pago '+nf(r.pg),12),mw('A pagar '+nf(r.d-r.pg),12))+20;
  return Math.max(124,Math.ceil(Math.max(n1,n2,n3)))}
function fitAll(){colKeys().forEach(k=>{W[k]=UI.w[k]||fitW(k)});applyW()}
function growW(k){if(UI.w[k])return;const w=fitW(k);if(w>(W[k]||0)){W[k]=w;applyW()}}
const colKeys=()=>['t','c','v',...rangeM()];
function applyW(){const cols=document.querySelectorAll('#tbl col'),ks=colKeys();let t=0;ks.forEach((k,i)=>{const w=W[k]||124;if(cols[i])cols[i].style.width=w+'px';t+=w});
  const tb=$('#tbl');if(!tb)return;tb.style.width=t+'px';tb.style.setProperty('--l1',(W.t||34)+'px');tb.style.setProperty('--l2',((W.t||34)+(W.c||200))+'px')}
const rsz=k=>`<div class="rs" data-k="${k}" title="Arraste para ajustar. Clique duas vezes para ajustar ao conteúdo."></div>`;
const dueTxt=c=>{const cd=cardOf(c);return cd?'dia '+cd.due:(c.d||'')};
const pk=(c,k)=>c.p[k]===2?BLU:c.p[k]?GRN:RED;
const cyc=(c,k)=>{const p=c.p[k];if(!p)c.p[k]=1;else if(p===1)c.p[k]=2;else delete c.p[k]};
function upd(){const R=calc();
  for(const k of rangeM()){const r=R[k];let e=document.getElementById('an'+k);if(e)e.textContent=nf(r.so);
    e=document.getElementById('ds'+k);if(e)e.textContent=nf(r.d);
    e=document.getElementById('sd'+k);if(e){e.textContent=nf(r.sd);e.style.color=r.sd<0?'var(--text-danger)':'var(--text-success)'}
    e=document.getElementById('pg'+k);if(e)e.innerHTML='Pago '+nf(r.pg)+'<br>A pagar '+nf(r.d-r.pg)+(r.pf?'<br><span style="color:var(--text-accent)">Por fora '+nf(r.pf)+'</span>':'')}
  const m=$('#phs');if(m){const r=R[mk(today())];if(r)m.textContent=rs(r.sd)}}
function vPlan(){
  const R=calc(),M=rangeM(),cur=mk(today()),cs=live(D.contas).sort((a,b)=>(a.i||0)-(b.i||0));
  let h=`<div class="tc"><span>Tom de cinza das linhas de conta</span><input type="range" min="0" max="24" step="1" value="${UI.tone}" data-t="1" aria-label="Tom de cinza das linhas"><span id="tv" style="min-width:30px">${UI.tone}%</span>${bt('trst',null,'Padrão','sm3')}</div>`;
  h+='<div class="mx" id="mx"><table id="tbl"><colgroup>'+colKeys().map(()=>'<col>').join('')+'</colgroup><thead><tr><th class="stk c0"></th><th class="l stk c1">Conta'+rsz('c')+'</th><th class="l stk c2">Venc.'+rsz('v')+'</th>';
  M.forEach(k=>{h+=`<th class="mo${k===cur?' cur':''}">${mlab(k)}${k===cur?' · atual':''}<span class="mdel" data-a="mdel" data-i="${k}" role="button" aria-label="Excluir mês" title="Excluir este mês">${ic('trash',13)}</span>${rsz(k)}</th>`});
  h+='</tr></thead><tbody><tr class="hl"><td colspan="3" class="l lab stk cs" style="font-size:12px;background:var(--surface-1)">Saldo remanescente</td>';
  M.forEach(k=>{h+=`<td><div class="cl2"><input class="in r${R[k].ov?' ed':''}" style="font-size:12px!important" data-so="${k}" value="${nf(R[k].so)}" inputmode="decimal" aria-label="Saldo remanescente" title="${R[k].ov?'Valor digitado por você. Apague para voltar ao cálculo automático (saldo total do mês anterior).':'Calculado: saldo total do mês anterior. Digite para ajustar.'}"><span class="ck${R[k].ov?'':' gh'}" title="Valor digitado por você">${ic('pencil',15,'var(--text-warning)')}</span></div></td>`});
  h+='</tr><tr class="hl"><td colspan="3" class="l lab stk cs" style="font-weight:500;font-size:14px;background:var(--surface-1)">+ Entrada do mês</td>';
  M.forEach(k=>{h+=`<td><div class="cl2"><input class="in r en" data-e="${k}" value="${R[k].e?nf(R[k].e):''}" placeholder="0,00" inputmode="decimal" aria-label="Entrada do mês"><span class="ck gh">${ic('circle',18)}</span></div></td>`});
  h+='</tr>';
  cs.forEach(c=>{const conf=S.dd===c.id,col=rowCol(c),cd=cardOf(c);
    h+=`<tr class="${conf?'dl':'ac2'}"><td class="ac stk c0"><div class="tr" data-a="del" data-i="${c.id}" role="button" aria-label="Excluir conta">${ic('trash',16)}</div></td>`;
    if(conf)h+=`<td class="l stk c1"><div class="cn" style="gap:6px;padding:0 8px"><span style="font-size:12px;color:var(--text-danger);flex:1">Excluir esta conta?</span><span class="mb" data-a="delok" data-i="${c.id}" role="button">Sim</span><span class="mb" data-a="delno" role="button">Não</span></div></td>`;
    else{h+=`<td class="l stk c1"><div class="cn"><span class="dw" data-a="pk" data-i="${c.id}" role="button" aria-label="Escolher cor"><span class="dt" style="${col?'background:'+col:'border:1px dashed var(--text-muted)'}"></span></span><input class="in" data-n="${c.id}" value="${esc(c.n)}" aria-label="Nome da conta">`;
      if(S.pk===c.id)h+='<div class="pop">'+PAL.map(p=>`<span class="sw" data-a="setc" data-i="${c.id}" data-c="${p}" style="background:${p}" role="button"></span>`).join('')+`<span class="sw" data-a="setc" data-i="${c.id}" data-c="" role="button" aria-label="Sem cor">${ic('x',12)}</span></div>`;
      h+='</div></td>'}
    h+=`<td class="l stk c2"><input class="in ds" data-d="${c.id}" value="${esc(dueTxt(c))}" placeholder="sem data" ${cd?'readonly title="Vencimento do cartão: ajuste na aba Cartões"':''} aria-label="Vencimento"></td>`;
    M.forEach(k=>{const v=c.v[k]||0,pg=!!c.p[k];h+=`<td><div class="cl2"><input class="in r ${pg?'pg':'up'}${isEd(c,k)?' ed':''}" data-c="${c.id}|${k}" value="${v?nf(v):''}" placeholder="0,00" inputmode="decimal" aria-label="Valor"><span class="ck" data-a="pd" data-i="${c.id}|${k}" role="button" aria-label="Alternar: a pagar, pago desta conta, pago de outra conta" title="Clique: a pagar → pago desta conta (verde) → pago de outra conta (azul, não desconta)">${ic(pg?'circle-check':'circle',18,pk(c,k))}</span></div></td>`});
    h+='</tr>'});
  h+='</tbody><tfoot class="ft"><tr><td colspan="3" class="l lab stk cs" style="background:var(--surface-1)">− Despesas do mês</td>';
  M.forEach(k=>{h+=`<td class="num" id="ds${k}" style="color:var(--text-danger)"></td>`});
  h+='</tr><tr><td colspan="3" class="l lab stk cs" style="font-weight:500;background:var(--surface-1)">= Saldo total</td>';
  M.forEach(k=>{h+=`<td class="num sd" id="sd${k}"></td>`});
  h+='</tr><tr><td colspan="3" class="l lab sm stk cs" style="background:var(--surface-1)">Pago e a pagar</td>';
  M.forEach(k=>{h+=`<td class="pgl" id="pg${k}"></td>`});
  h+=`</tr></tfoot></table></div><div class="ab2" data-a="cadd" role="button">${ic('plus',14)} Nova conta</div><div class="ab2" data-a="addm" role="button">${ic('calendar-plus',14)} Novo mês</div>`;
  h+='<div class="lg"><span><b style="font-weight:500;color:var(--text-primary)">Branco brilhante</b> = a pagar</span><span><b style="font-weight:400;color:var(--text-muted)">Cinza</b> = pago: <b style="font-weight:400;color:var(--text-success)">check verde</b> sai desta conta, <b style="font-weight:400;color:var(--text-accent)">check azul</b> foi pago de outra conta e não desconta do saldo</span><span><span class="sq"></span> valor alterado por você</span><span>Arraste a borda do cabeçalho para mudar a largura. Dois cliques na borda ajustam ao conteúdo.</span></div>';
  return h}
function vPhone(){
  const R=calc(),M=rangeM(),k=S.fm2,r=R[k]||{e:0,so:0,d:0,sd:0,pg:0},cs=live(D.contas).sort((a,b)=>(a.i||0)-(b.i||0)),first=k<=M[0],last=k>=M[M.length-1];
  let h=`<div style="display:flex;align-items:center;gap:4px;margin-bottom:8px">${ibt('fm',-1,'chevron-left','Mês anterior')}<span style="flex:1;text-align:center;font-size:15px;font-weight:500">${MESL[+k.slice(5)-1]} ${k.slice(0,4)}</span>${ibt('fm',1,'chevron-right','Próximo mês')}${ibt('fcol',null,S.fc?'chevron-down':'chevron-up',S.fc?'Mostrar resumo':'Recolher resumo')}</div>`;
  if(!S.fc){const p=r.pg,dm=r.d||1;
    h+=`<div class="cd2" style="padding:8px 12px"><div class="cl"><span>Saldo remanescente${r.ov?' <small style="color:var(--text-warning)">(ajustado)</small>':''}</span><input class="in r" style="width:110px" type="text" inputmode="decimal" data-so="${k}" value="${nf(r.so)}"></div><div class="cl" style="border-top:.5px solid var(--border)"><span>+ Entrada do mês</span><input class="in r" style="width:110px" type="text" inputmode="decimal" data-e="${k}" value="${r.e?nf(r.e):''}" placeholder="0,00"></div><div class="cl" style="border-top:.5px solid var(--border)"><span>− Despesas do mês</span><span style="color:var(--text-danger)">${rs(r.d)}</span></div><div class="cl" style="border-top:.5px solid var(--border-strong);font-weight:500"><span>= Saldo total</span><span style="color:${r.sd<0?'var(--text-danger)':GRN};font-size:16px">${rs(r.sd)}</span></div></div><p class="sm" style="font-size:11px;margin:0 0 8px">O saldo total deste mês passa para o mês seguinte.</p><div style="height:6px;background:var(--surface-1);border-radius:3px;margin-bottom:4px"><div style="height:6px;width:${Math.max(0,Math.min(100,Math.round(p/dm*100)))}%;background:var(--text-secondary);border-radius:3px"></div></div><p class="sm" style="font-size:11px;margin:0 0 6px">Pago ${rs(p)} · A pagar ${rs(r.d-p)}${r.pf?` · <span style="color:var(--text-accent)">Por fora ${rs(r.pf)}</span>`:''}</p>`}
  h+=`<div class="sg" style="margin-bottom:6px">${bt('conta-new',null,'Conta','sm3','plus')}${bt('addm',null,'Novo mês','sm3','calendar-plus')}${bt('mdel',k,'Excluir mês','sm3 dg','trash')}<span style="flex:1"></span>${bt('fedit',null,S.fe?'Pronto':'Editar','sm3'+(S.fe?' sa':''),'pencil')}</div><div>`;
  cs.forEach(c=>{const v=c.v[k]||0,pg=!!c.p[k],dd=dueDay(c),col=rowCol(c);
    h+=`<div class="rw2" style="gap:8px;padding:8px 0;cursor:default"><span data-a="pd" data-i="${c.id}|${k}" style="display:flex">${ic(pg?'circle-check':'circle',22,pk(c,k))}</span><div style="flex:1;min-width:0;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;${pg?'color:var(--text-secondary)':''}"><span class="dt" style="${col?'background:'+col:'border:1px dashed var(--text-muted)'};margin-right:6px"></span>${esc(c.n)}</div><span style="flex:0 0 auto;font-size:10px;white-space:nowrap;color:${dd?'var(--text-secondary)':'var(--text-warning)'}">${dd?'dia '+dd:'sem data'}</span>`;
    if(S.fe)h+=ibt('conta-edit',c.id,'pencil','Editar conta','sm2');
    else h+=`<input class="in r ${v>0?(pg?'pg':'up'):''}${isEd(c,k)?' ed':''}" style="width:84px" data-c="${c.id}|${k}" value="${v?nf(v):''}" placeholder="0,00" inputmode="decimal">`;
    h+='</div>'});
  return h+'</div>'}
function vCart(){
  const cards=live(D.cards),tot=cards.reduce((a,c)=>a+usedOf(c),0),cur=mk(today());
  let h=`<div class="mini" style="display:inline-block;margin-bottom:12px">Limite usado (todos os cartões): <b style="font-weight:500;font-size:15px">${rs(tot)}</b></div><div class="g2">`;
  cards.forEach(c=>{const row=D.contas.find(x=>!x.x&&x.card===c.id),fat=row?(row.v[cur]||0):0;
    h+=`<div class="cd2"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><span class="dot" style="background:${ccol(c)};width:13px;height:13px"></span><b style="font-weight:500;font-size:14px;flex:1">${esc(c.n)}</b><span class="sm">usado ${rs(usedOf(c))}</span></div><p style="margin:0 0 10px;font-size:13px">Fatura de ${mlab(cur)}: <b style="font-weight:500">${rs(fat)}</b></p><div style="display:flex;gap:12px;align-items:center"><span class="sm">Fecha dia</span><input class="f2" data-cc="${c.id}" type="number" min="1" max="31" value="${c.close}" style="width:70px;text-align:center"><span class="sm">Vence dia</span><input class="f2" data-cd="${c.id}" type="number" min="1" max="31" value="${c.due}" style="width:70px;text-align:center"></div></div>`});
  return h+`</div><div class="cd2" style="margin-top:14px"><p class="sm" style="margin:0 0 6px">Compra no dia do fechamento entra na</p><div class="sg">${bt('cr','atual','Fatura atual',S.cr==='atual'?'sa':'')}${bt('cr','prox','Próxima',S.cr==='prox'?'sa':'')}</div><p class="sm" style="font-size:11px;margin:8px 0 0">"Usado" soma as faturas e parcelas do mês atual em diante. Confira o dia de fechamento de cada cartão no app do banco.</p></div>`}
function vFin(){
  const R=calc(),r=R[mk(today())];
  let h=`<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px"><div><p class="h1">Finanças</p><p class="sm dk" style="margin:2px 0 0">Edite qualquer valor, mesmo de conta já paga: o saldo recalcula e os outros aparelhos recebem a mudança.</p></div><div class="mini">Saldo total de ${mlab(mk(today()))}: <b style="font-weight:500" id="phs">${r?rs(r.sd):''}</b></div></div>`;
  h+=`<div class="sg" style="margin-bottom:12px">${bt('fsub','plan',isPh()?'Mês':'Planilha',S.fsub==='plan'?'sa':'')}${bt('fsub','cart','Cartões',S.fsub==='cart'?'sa':'')}</div>`;
  return h+(S.fsub==='plan'?(isPh()?vPhone():vPlan()):vCart())}
const VIEWS={hoje:vHoje,comp:vComp,agenda:vAgenda,tar:vTar,notas:vNotas,fin:vFin};
function mConta(id){const c=id&&D.contas.find(x=>x.id===id);
  S.set=0;$('#ov').innerHTML=`<div class="ov"><div class="md"><p style="font-size:16px;font-weight:500;margin:0 0 10px">${c?'Editar conta':'Nova conta'}</p><form data-form="conta"><input type="hidden" name="id" value="${c?c.id:''}"><label class="fl"><small>Nome</small><input class="f2" type="text" name="n" required value="${esc(c?c.n:'')}"></label><label class="fl"><small>Vencimento (ex.: dia 10)</small><input class="f2" type="text" name="d" value="${esc(c?c.d||'':'')}"></label><div class="sg" style="justify-content:flex-end;margin-top:12px">${c?bt('conta-del',c.id,'Excluir','dg','trash','style="margin-right:auto"'):''}${bt('setclose',null,'Cancelar')}<button class="bt sa" type="submit">Salvar</button></div></form></div></div>`}

let SX=0,DEF=null;
const standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone;
function instUi(){const b=$('#inst');if(b)b.hidden=!DEF||standalone()}
addEventListener('beforeinstallprompt',e=>{e.preventDefault();DEF=e;instUi();if(S.set)draw()});
addEventListener('appinstalled',()=>{DEF=null;instUi();if(S.set)draw()});
function tabsHtml(){return TB.map(t=>`<div class="tbn${S.t===t[0]?' on':''}" data-a="tab" data-i="${t[0]}" role="button">${ic(t[1],16)}${t[2]}</div>`).join('')}
function applyTone(){const a=$('#app');a.style.setProperty('--t1',UI.tone+'%');a.style.setProperty('--t2',(UI.tone+6)+'%');const v=$('#tv');if(v)v.textContent=UI.tone+'%'}
function draw(){
  const mx=$('#mx');if(mx)SX=mx.scrollLeft;
  const nt=$('#nt'),ntv=nt?nt.value:'';
  $('#tabs').innerHTML=tabsHtml();$('#bnav').innerHTML=tabsHtml();
  $('#main').innerHTML=VIEWS[S.t]();applyTone();
  $('#ov').innerHTML=modalRD()||modalMD()||modalSet();
  if(S.t==='fin'&&S.fsub==='plan'&&!isPh()){upd();if(!FIT){FIT=true;fitAll();const th=document.querySelector('th.cur'),m2=$('#mx');if(th&&m2&&!SX)SX=Math.max(0,th.offsetLeft-(W.t+W.c+W.v)-20)}else applyW();const m2=$('#mx');if(m2)m2.scrollLeft=SX}
  else if(S.t==='fin')upd();
  if(nt&&$('#nt'))$('#nt').value=ntv;
  instUi();setSt()}
function softRender(){const a=document.activeElement;if(a&&/INPUT|TEXTAREA|SELECT/.test(a.tagName)&&$('#main').contains(a)){return}if(S.set||S.rd)return;draw()}
function go(t){dropEmpty();S.t=t;ls('as_tab',t);S.no=null;S.nd=0;S.te=null;S.ok='';S.gm=0;resetForm();S.rd='';S.dd=null;S.set=0;S.md=null;if(t==='hoje')S.hd=0;if(t==='comp')S.fm='e';if(t==='fin')FIT=false;SX=0;draw();scrollTo(0,0)}
function resetForm(){S.ne=0;S.nerr='';S.nh='';S.nm='00';S.nn='';S.nr='none';S.nu=''}
function dropEmpty(){if(!S.no)return;const n=D.notas.find(x=>x.id===S.no);if(n&&!n.t&&!n.c){if(n.u){n.x=1;touch(n)}else D.notas.splice(D.notas.indexOf(n),1)}}
function addTask(){const el=$('#nt'),v=el?el.value.trim():'';if(!v){S.err='Digite o nome da tarefa';return}S.err='';const t={id:uid(),n:v,l:S.tl==='Todas'?'Geral':S.tl,d:0,s:0};D.tarefas.push(t);touch(t)}
function saveEv(){
  const nv=S.nn.trim();
  if(!nv){S.nerr='Digite o nome do compromisso';return false}
  let end='';const k=S.sel;
  if(S.nr!=='none'&&S.nu.replace(/\s/g,'')){const u=/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(S.nu.replace(/\s/g,''));
    if(!u||+u[2]>12||+u[2]<1||+u[1]<1||+u[1]>31){S.nerr='Data final no formato dd/mm/aaaa';return false}
    end=u[3]+'-'+pad(+u[2])+'-'+pad(+u[1]);if(end<k){S.nerr='A data final precisa ser depois do início';return false}}
  const ev={id:uid(),s:k,h:S.nh===''?'':pad(+S.nh)+':'+S.nm,t:nv,r:S.nr,e:end,ex:[]};D.eventos.push(ev);touch(ev);resetForm();return true}
function delEv(key,mode){
  const[date,id]=key.split('|'),e=D.eventos.find(x=>x.id===id);if(!e)return;
  if(mode==='one'&&e.r!=='none')e.ex=[...(e.ex||[]),date];
  else if(mode==='next'&&e.r!=='none'){e.e=addD(date,-1);if(e.e<e.s)e.x=1}
  else e.x=1;
  touch(e);S.rd='';S.dc=''}
function lancar(){
  const g=S.g,amt=pv(g.v);
  if(!g.k){S.gerr='Escolha o cartão';return}
  if(!amt){S.gerr='Digite um valor maior que zero';return}
  const card=D.cards.find(c=>c.id===g.k),n=g.par?g.n:1,tt=(g.par&&g.mode==='par')?r2(amt*n):amt,per=r2(tt/n);
  const ks=faturaKeys(card,pdate(),S.cr==='prox'?'proxima':'atual',n),row=cardRow(card),parts=[];
  ks.forEach((k,i)=>{const v=i===n-1?r2(tt-per*(n-1)):per;row.v[k]=r2((row.v[k]||0)+v);if(row.o[k]!==undefined)row.o[k]=r2(row.o[k]+v);parts.push({id:row.id,k,v})});
  touch(row);LAN.push({parts,tot:tt});
  S.ok=`Lançado no ${card.n}: ${rs(tt)}${n>1?' em '+n+'x':' à vista'}. Fatura de ${ml(ks[0])}. Já somado na planilha.`;
  S.gm=0;S.gerr='';FIT=false}
function desfazer(){const l=LAN.pop();if(!l)return;
  l.parts.forEach(p=>{const c=D.contas.find(x=>x.id===p.id);if(!c)return;const nv=r2((c.v[p.k]||0)-p.v);if(nv>0)c.v[p.k]=nv;else delete c.v[p.k];
    if(c.o[p.k]!==undefined){const no=r2(c.o[p.k]-p.v);if(no>0)c.o[p.k]=no;else delete c.o[p.k]}touch(c)});
  S.ok='Lançamento desfeito.';FIT=false}

/* ===== ações ===== */
const find=(a,id)=>a.find(x=>x.id===id);
const A={
  tab:(el,v)=>{go(v);return 1},
  hprev:()=>{S.hd--},hnext:()=>{S.hd++},
  gopen:()=>{S.gm=1;S.g={k:'',v:'',par:0,n:12,mode:'tot',dia:0};S.gerr='';S.ok=''},
  gclose:()=>{S.gm=0},gcard:(el,v)=>{S.g.k=v;S.gerr=''},gpar:(el,v)=>{S.g.par=+v},gmode:(el,v)=>{S.g.mode=v},gdia:(el,v)=>{S.g.dia=+v},
  glan:()=>lancar(),gundo:()=>desfazer(),
  flt:(el,v)=>{S.fm=v;S.o=''},open:(el,v)=>{S.o=S.o===v?'':v},fcol:()=>{S.fc=S.fc?0:1},
  ppay:(el,v)=>{const[d,id]=v.split('|'),c=find(D.contas,id);cyc(c,mk(d));touch(c)},
  edel:(el,v)=>{const e=find(D.eventos,v.split('|')[1]);if(e&&e.r&&e.r!=='none'){S.rd=v;S.rch='one';S.dc=''}else if(S.dc===v){delEv(v,'all')}else S.dc=v},
  rdsel:(el,v)=>{S.rch=v},rdno:()=>{S.rd=''},rdok:()=>{delEv(S.rd,S.rch)},
  goto:(el,v)=>{S.sel=v;S.ref=v;S.t='agenda';resetForm()},
  aday:(el,v)=>{S.sel=v;S.ref=v;resetForm()},
  atoday:()=>{S.sel=today();S.ref=today()},avw:(el,v)=>{S.av=v;S.ref=S.sel},
  aprev:()=>{S.ref=S.av==='sem'?addD(S.ref,-7):addM(mk(S.ref),-1)+'-01'},
  anext:()=>{S.ref=S.av==='sem'?addD(S.ref,7):addM(mk(S.ref),1)+'-01'},
  enew:()=>{resetForm();S.ne=1},ecancel:()=>{resetForm()},esave:()=>{saveEv()},
  tl:(el,v)=>{S.tl=v;S.te=null},
  tdone:(el,v)=>{const t=find(D.tarefas,v);t.d=t.d?0:1;S.te=null;touch(t)},
  tstar:(el,v)=>{const t=find(D.tarefas,v);t.s=t.s?0:1;touch(t)},
  tagopen:(el,v)=>{S.te=S.te===v?null:v},
  tagset:(el,v)=>{const q=v.split('|'),t=find(D.tarefas,q[0]);t.l=q[1];S.te=null;touch(t)},
  clr:()=>{D.tarefas.forEach(t=>{if(!t.x&&t.d){t.x=1;touch(t)}})},
  tadd:()=>addTask(),
  nopen:(el,v)=>{dropEmpty();S.no=v;S.nd=0},
  nnew:()=>{dropEmpty();const n={id:uid(),t:'',c:'',p:0};D.notas.push(n);S.no=n.id;S.nd=0},
  nback:()=>{dropEmpty();S.no=null},
  npin:(el,v)=>{const n=find(D.notas,v);n.p=n.p?0:1;touch(n)},
  ndel:()=>{S.nd=1},ndelno:()=>{S.nd=0},
  ndelok:()=>{const n=find(D.notas,S.no);if(n){n.x=1;touch(n)}S.no=null;S.nd=0},
  nsave:()=>{dropEmpty();S.no=null;S.nd=0},
  fsub:(el,v)=>{S.fsub=v;SX=0;FIT=false},
  cr:(el,v)=>{S.cr=v},
  trst:()=>{UI.tone=6;ls('as_ui',UI)},
  fm:(el,v)=>{S.fm2=addM(S.fm2,+v)},
  fedit:()=>{S.fe=S.fe?0:1},
  pd:(el,v)=>{const[id,k]=v.split('|'),c=find(D.contas,id);cyc(c,k);touch(c)},
  cadd:()=>{const c={id:uid(),n:'Nova conta',d:'',c:null,card:'',v:{},o:{},p:{},i:Math.max(-1,...D.contas.map(x=>x.i||0))+1};D.contas.push(c);touch(c);FIT=false},
  'conta-new':()=>{mConta(null);return 1},
  'conta-edit':(el,v)=>{mConta(v);return 1},
  'conta-del':(el,v)=>{const c=find(D.contas,v);c.x=1;touch(c);S.fe=0;$('#ov').innerHTML='';FIT=false},
  mdel:(el,v)=>{S.md=S.md===v?null:v},mdno:()=>{S.md=null},
  mdok:(el,v)=>{const k=v;D.meses[k]={x:1,u:nowT()};live(D.contas).forEach(c=>{if(k in c.v||k in c.o||k in c.p){delete c.v[k];delete c.o[k];delete c.p[k];touch(c)}});S.md=null;if(S.fm2===k){const M=rangeM();S.fm2=M.includes(mk(today()))?mk(today()):M[M.length-1]}dirty();FIT=false},
  addm:()=>{const M=rangeM(),last=M[M.length-1],nk=addM(last,1);ensureM(nk).u=nowT();D.meses[nk].e=(D.meses[last]||{}).e||0;
    live(D.contas).forEach(c=>{if(c.v[last]){c.v[nk]=c.v[last];c.o[nk]=c.v[last];touch(c)}});S.fm2=nk;dirty();FIT=false},
  del:(el,v)=>{S.dd=v},delno:()=>{S.dd=null},
  delok:(el,v)=>{const c=find(D.contas,v);c.x=1;touch(c);S.dd=null;FIT=false},
  pk:(el,v)=>{S.pk=S.pk===v?null:v},
  setc:(el,v)=>{const c=find(D.contas,v);c.c=el.dataset.c||null;S.pk=null;touch(c)},
  settings:()=>{S.set=1;S.rd=''},
  setclose:()=>{S.set=0;$('#ov').innerHTML=''},
  sync:async()=>{await push();draw()},
  backup:()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify(D,null,1)],{type:'application/json'}));a.download='assistente-backup-'+today()+'.json';a.click()},
  install:async()=>{if(!DEF){return}DEF.prompt();try{await DEF.userChoice}catch(e){}DEF=null;instUi();return 1},
  logout:()=>{CFG={repo:CFG.repo};ls('as_cfg',CFG);ls('as_sha',null);SHA=null;ST='off';S.set=0;loginView();return 1},
  local:()=>{CFG.local=1;ls('as_cfg',CFG);boot2();return 1}
};
const F={
  conta:f=>{const id=f.get('id');let c=id&&find(D.contas,id);if(!c){c={id:uid(),c:null,card:'',v:{},o:{},p:{},i:Math.max(-1,...D.contas.map(x=>x.i||0))+1};D.contas.push(c)}
    c.n=f.get('n').trim();c.d=f.get('d').trim();touch(c);$('#ov').innerHTML='';FIT=false;draw()},
  token:async f=>{const repo=f.get('repo').trim(),tok=f.get('token').trim()||CFG.token;
    if(!tok){$('#seterr').textContent='Cole o token do GitHub.';return}
    try{await testToken(repo,tok)}catch(e){$('#seterr').textContent=e.message;return}
    CFG={...CFG,repo,token:tok,local:0};ls('as_cfg',CFG);SHA=null;ETAG=null;S.set=0;draw();push()},
  login:async f=>{const repo=f.get('repo').trim(),tok=f.get('token').trim();
    try{await testToken(repo,tok)}catch(e){loginView(e.message);return}
    CFG={repo,token:tok};ls('as_cfg',CFG);boot2()}
};
function loginView(err=''){
  $('#tabs').innerHTML='';$('#bnav').innerHTML='';
  $('#main').innerHTML=`<div class="login cd2"><h2 style="margin-bottom:8px;font-weight:500">Assistente</h2><p>Para sincronizar entre seus aparelhos, cole o token do GitHub. Ele fica só neste navegador.</p><ol><li>GitHub → Settings → Developer settings → Fine-grained tokens → Generate new token.</li><li>Repositório: somente <b>assistente-dados</b>. Permissão <b>Contents: Read and write</b>.</li></ol><form data-form="login"><label class="fl"><small>Repositório de dados</small><input class="f2" type="text" name="repo" value="${esc(CFG.repo||'joshpunk-JL/assistente-dados')}"></label><label class="fl"><small>Token</small><input class="f2" type="password" name="token" autocomplete="off" placeholder="github_pat_…" required></label><button class="bt sa" type="submit" style="height:34px">Entrar</button><div class="err">${esc(err)}</div></form><p class="sm" style="margin-top:14px">Sem token o app funciona só neste aparelho. <a href="#" data-a="local" style="color:var(--text-accent)">Usar sem sincronizar</a></p></div>`}

document.addEventListener('click',e=>{
  const el=e.target.closest('[data-a]');
  if(!el){if(S.pk||S.pc){S.pk=null;S.pc='';draw()}return}
  const a=el.dataset.a,v=el.dataset.i;
  if(el.tagName==='A')e.preventDefault();
  const gv=$('#gv');if(gv)S.g.v=gv.value;
  if(a!=='edel')S.dc='';
  if(a!=='pchoose')S.pc='';
  if(a!=='pk'&&a!=='setc')S.pk=null;
  const fn=A[a];if(!fn)return;
  const r=fn(el,v);if(r===1)return;
  Promise.resolve(r).then(()=>{if(a!=='sync'&&a!=='backup')draw()})});
document.addEventListener('submit',e=>{const f=e.target.closest('form[data-form]');if(!f)return;e.preventDefault();F[f.dataset.form]?.(new FormData(f),f)});
document.addEventListener('input',e=>{
  const el=e.target,d=el.dataset,id=el.id;
  if(d.t){UI.tone=+el.value;ls('as_ui',UI);applyTone();return}
  if(d.c){const[cid,k]=d.c.split('|'),c=find(D.contas,cid),n=pn(el.value);
    if(c.o[k]===undefined)c.o[k]=r2(c.v[k]||0);
    if(n)c.v[k]=n;else delete c.v[k];
    el.classList.toggle('ed',isEd(c,k));el.classList.toggle('pg',!!c.p[k]&&n>0);el.classList.toggle('up',!c.p[k]&&n>0);touch(c);upd();return}
  if(d.e){const m=ensureM(d.e);m.e=pn(el.value);m.u=nowT();dirty();upd();return}
  if(d.so){const m=ensureM(d.so),raw=el.value.trim();m.a=raw===''?null:pn(raw);m.u=nowT();dirty();upd();return}
  if(d.n){const c=find(D.contas,d.n);c.n=el.value;touch(c);return}
  if(d.d){const c=find(D.contas,d.d);c.d=el.value;touch(c);return}
  if(d.cc||d.cd){const c=find(D.cards,d.cc||d.cd),v=parseInt(el.value,10);if(v>=1&&v<=31){if(d.cc)c.close=v;else c.due=v;touch(c)}return}
  if(id==='nvn'){S.nn=el.value;S.nerr=''}
  if(id==='nve'){S.nu=el.value;S.nerr=''}
  if(id==='nt'&&S.err){S.err='';draw()}
  if(id==='ntt'){const n=find(D.notas,S.no);n.t=el.value;touch(n);$('#nl').innerHTML=nlist()}
  if(id==='ntc'){const n=find(D.notas,S.no);n.c=el.value;touch(n)}
  if(id==='sq'){S.q=el.value;$('#nl').innerHTML=nlist()}
  if(id==='gv'){S.g.v=el.value;S.gerr='';const ge=$('#ge');if(ge)ge.textContent='';$('#gp').innerHTML=gpHtml()}});
document.addEventListener('change',e=>{
  const id=e.target.id;
  if(id==='nvr'){S.nr=e.target.value;draw();return}
  if(id==='nvh'){S.nh=e.target.value;S.nerr='';if(S.nh==='')S.nm='00';draw();return}
  if(id==='nvm'){S.nm=e.target.value;return}
  if(id==='gn'){S.g.n=+e.target.value;$('#gp').innerHTML=gpHtml()}});
document.addEventListener('focusout',e=>{
  const el=e.target,d=el.dataset;if(!d)return;
  if(d.c){const[cid,k]=d.c.split('|'),c=find(D.contas,cid);el.value=c.v[k]?nf(c.v[k]):'';if(S.fsub==='plan'&&!isPh())growW(k)}
  if(d.e){const m=D.meses[d.e];el.value=m&&m.e?nf(m.e):'';growW(d.e)}
  if(d.so){upd();const R=calc();el.value=nf(R[d.so].so);el.classList.toggle('ed',R[d.so].ov)}
  if(d.n)growW('c');
  if(d.d)growW('v');
  setTimeout(()=>{if(S.t==='fin'||S.t==='notas'){/* mantém */}},0)});
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&(S.set||S.rd||$('#ov').innerHTML)){S.set=0;S.rd='';$('#ov').innerHTML='';return}
  if(e.target.id==='nt'&&e.key==='Enter'){addTask();draw();$('#nt')?.focus()}
  if(e.target.dataset&&(e.target.dataset.c||e.target.dataset.e||e.target.dataset.so)&&e.key==='Enter')e.target.blur()});
document.addEventListener('mousedown',e=>{
  const el=e.target;if(!el.classList||!el.classList.contains('rs'))return;
  e.preventDefault();const k=el.dataset.k,x0=e.clientX,w0=W[k]||124;
  const mv=ev=>{W[k]=Math.max(50,w0+ev.clientX-x0);applyW()};
  const up=()=>{document.removeEventListener('mousemove',mv);document.removeEventListener('mouseup',up);UI.w[k]=W[k];ls('as_ui',UI)};
  document.addEventListener('mousemove',mv);document.addEventListener('mouseup',up)});
document.addEventListener('dblclick',e=>{const el=e.target;if(!el.classList||!el.classList.contains('rs'))return;const k=el.dataset.k;delete UI.w[k];ls('as_ui',UI);W[k]=fitW(k);applyW()});
matchMedia('(max-width:760px)').addEventListener('change',()=>{if($('#main').innerHTML)draw()});
addEventListener('online',()=>push());addEventListener('offline',()=>setSt('off'));
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&CFG.token)lg('as_dirty',0)?push():pull()});
setInterval(()=>{if(!document.hidden&&CFG.token&&!busy)lg('as_dirty',0)?push():pull()},60000);

function boot2(){FIT=false;draw();if(CFG.token)push()}
(function boot(){
  if('serviceWorker' in navigator&&(location.protocol==='https:'||location.hostname==='localhost'))navigator.serviceWorker.register('sw.js').catch(()=>{});
  if(!CFG.token&&!CFG.local){loginView();setSt();return}
  boot2()
})();
