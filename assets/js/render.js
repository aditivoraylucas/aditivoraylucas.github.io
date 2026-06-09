import { $, state, esc, money, pct, calcPctGeral } from './state.js';
import { db } from './firebase.js';
import { doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function saveObra(obra){ await setDoc(doc(db,'users',state.user.uid,'obras',obra.id), obra); }
export async function deleteObra(id){ await deleteDoc(doc(db,'users',state.user.uid,'obras',id)); }
export function scheduleSave(){
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async()=>{ const o=currentObra(); if(o){ o.itens=state.rows; await saveObra(o); } }, 1200);
}
export function currentObra(){ return state.obras.find(o => o.id === state.selectedObraId); }

export function renderCurvaS(canvasId,wrapId,itens,prev){
  const canvas=$(canvasId); if(!canvas) return prev;
  if(prev) prev.destroy();
  const dark=document.documentElement.dataset.theme==='dark';
  const gc=dark?'rgba(255,255,255,0.1)':'rgba(0,0,0,0.1)';
  const tc=dark?'#94a3b8':'#64748b';
  const mobile=window.innerWidth<=900;
  const wrap=$(wrapId);
  if(wrap){
    wrap.style.overflowX='hidden';
    canvas.style.minWidth='';
    canvas.style.width='100%';
  }
  const n=itens.length;
  const containerW=wrap?wrap.offsetWidth:600;
  const thickness=mobile
    ? Math.max(4, Math.floor((containerW-16)/(n||1))-2)
    : Math.max(18,Math.min(40,Math.floor(600/(n||1))));
  return new Chart(canvas.getContext('2d'),{
    type:'bar',
    data:{ labels:itens.map(r=>String(r.item||'')),
      datasets:[{ label:'% Executado', data:itens.map(r=>Number(r.percentualExecutado)||0),
        backgroundColor:'rgba(99,102,241,0.2)',borderColor:'#6366f1',borderWidth:1,borderRadius:3,
        barThickness: mobile ? 'flex' : thickness }] },
    options:{
      responsive:true,
      maintainAspectRatio:false,
      scales:{ y:{beginAtZero:true,max:100,grid:{color:gc},ticks:{color:tc,callback:v=>v+'%'}},
        x:{grid:{display:false},ticks:{color:tc,font:{size:mobile?8:10},maxRotation:mobile?90:45,minRotation:0}} },
      plugins:{legend:{labels:{color:tc}}} }
  });
}

export function applySelected(o){
  state.rows=Array.isArray(o.itens)?o.itens:[];
  const pn=$('projName'); if(pn) pn.value=o.nomeProjeto||o.nome||'Nova obra';
  const pc=$('projContratada'); if(pc) pc.value=o.contratada||'';
  const ps=$('projScope'); if(ps) ps.value=o.medicaoAtual||'';
}

export function renderTable(){
  const tbody=$('tbody'); if(!tbody) return;
  tbody.innerHTML=state.rows.map((r,i)=>{
    const p=Number(r.percentualExecutado||0);
    const pctColor=p>=99.95?'color:var(--success);font-weight:700':'font-weight:700';
    return `
    <tr data-i="${i}">
      <td contenteditable="true" data-k="item">${esc(r.item)}</td>
      <td contenteditable="true" data-k="descricao" class="td-desc">${esc(r.descricao)}</td>
      <td contenteditable="true" data-k="valorContrato" style="text-align:right">${money(r.valorContrato)}</td>
      <td contenteditable="true" data-k="medicao" style="text-align:right">${money(r.medicao)}</td>
      <td contenteditable="true" data-k="acumulado" style="text-align:right">${money(r.acumulado)}</td>
      <td contenteditable="true" data-k="saldo" style="text-align:right">${money(r.saldo)}</td>
      <td contenteditable="true" data-k="percentualExecutado" style="text-align:right;${pctColor}">${p.toFixed(2)}</td>
      <td style="text-align:right"><button data-del="${i}" class="btn btn-danger" style="padding:.4rem;border-radius:6px">🗑</button></td>
    </tr>`;
  }).join('');
}

export function updateDashboard(){
  const o=currentObra();
  const vc=Number(o?.resumo?.valorContratoAditivo)||state.rows.reduce((a,r)=>a+Number(r.valorContrato||0),0);
  const ac=Number(o?.resumo?.acumuladoTotal)||state.rows.reduce((a,r)=>a+Number(r.acumulado||0),0);
  const p=calcPctGeral(o?.resumo,state.rows);
  if($('stats')) $('stats').innerHTML=
    `<div class="stat-card"><span class="stat-label">Valor CT / Aditivo</span><span class="stat-value" style="font-size:1rem">${money(vc)}</span></div>
     <div class="stat-card"><span class="stat-label">Acumulado Total</span><span class="stat-value" style="font-size:1rem;color:var(--success)">${money(ac)}</span></div>
     <div class="stat-card"><span class="stat-label">% Geral</span><span class="stat-value">${pct(p)}</span></div>
     <div class="stat-card"><span class="stat-label">Medição Atual</span><span class="stat-value" style="font-size:1.2rem">${esc(o?.medicaoAtual||'-')}</span></div>`;
  if($('countAll'))  $('countAll').textContent=money(vc);
  if($('countDone')) $('countDone').textContent=money(ac);
  if($('countPct'))  $('countPct').textContent=pct(p);
  if($('mainProjName'))       $('mainProjName').textContent       = o?.nomeProjeto||o?.nome||'-';
  if($('mainProjContratada')) $('mainProjContratada').textContent  = o?.contratada||'-';
  if($('mainProjScope'))      $('mainProjScope').textContent       = o?.medicaoAtual||'-';
  state.chartUser=renderCurvaS('sCurveChart','sCurveScrollWrap',state.rows,state.chartUser);
}

export function renderObrasBox(){
  const box=$('obrasBox'); if(!box) return;
  if(!state.obras.length){
    box.innerHTML='<p style="color:var(--text-muted);font-size:.8rem">Nenhuma obra cadastrada.</p>';
    return;
  }
  box.innerHTML=
    `<div class="form-group" style="margin-bottom:.5rem"><label>Obra ativa</label>
     <select id="obraSelect" class="form-control">
       ${state.obras.map(o=>`<option value="${o.id}" ${o.id===state.selectedObraId?'selected':''}>${esc(o.nome||'Obra')}</option>`).join('')}
     </select></div>
     <div style="display:flex;gap:.5rem;flex-wrap:wrap">
       <button class="btn btn-sec" id="replaceObraBtn" style="flex:1">🔄 Atualizar</button>
       <button class="btn btn-danger" id="deleteObraBtn" style="flex:1">🗑 Remover</button>
     </div>`;
  $('obraSelect').onchange=e=>{
    state.selectedObraId=e.target.value;
    const o=currentObra(); if(o){ applySelected(o); renderAll(); }
  };
  $('replaceObraBtn').onclick=()=>importFileFn(true);
  $('deleteObraBtn').onclick=async()=>{
    const idToDelete=state.selectedObraId;
    if(!idToDelete||!confirm('Remover obra?')) return;
    await deleteObra(idToDelete);
    const restantes=state.obras.filter(o=>o.id!==idToDelete);
    state.selectedObraId=restantes.length?restantes[0].id:null;
    if(state.selectedObraId){ const o=state.obras.find(x=>x.id===state.selectedObraId); if(o) applySelected(o); }
    else{ state.rows=[]; const pn=$('projName'); if(pn) pn.value=''; const pc=$('projContratada'); if(pc) pc.value=''; const ps=$('projScope'); if(ps) ps.value=''; }
    renderAll();
  };
}

export function renderAll(){ renderObrasBox(); renderTable(); updateDashboard(); }
let importFileFn = ()=>{};
export function setImportFileFn(fn){ importFileFn = fn; }

/* ---- ADMIN ---- */
export function renderAdminStats(){
  let tot=0,tvc=0,tac=0;
  Object.values(state.allUsers).forEach(u=>{
    if(u.role==='admin') return;
    (u.obras||[]).forEach(o=>{
      tot++;
      const it=Array.isArray(o.itens)?o.itens:[];
      tvc+=Number(o.resumo?.valorContratoAditivo)||it.reduce((a,i)=>a+Number(i.valorContrato||0),0);
      tac+=Number(o.resumo?.acumuladoTotal)||it.reduce((a,i)=>a+Number(i.acumulado||0),0);
    });
  });
  const p=tvc>0?+(tac/tvc*100).toFixed(2):0;
  if($('adminStats')) $('adminStats').innerHTML=
    `<div class="stat-card"><span class="stat-label">Total de Obras</span><span class="stat-value">${tot}</span></div>
     <div class="stat-card"><span class="stat-label">Valor CT / Aditivo</span><span class="stat-value" style="font-size:1rem">${money(tvc)}</span></div>
     <div class="stat-card"><span class="stat-label">% Geral</span><span class="stat-value">${pct(p)}</span></div>
     <div class="stat-card"><span class="stat-label">Acumulado Geral</span><span class="stat-value" style="font-size:1.1rem">${money(tac)}</span></div>`;
}

export function renderColabList(){
  const box=$('colabList'); if(!box) return;
  const colabs=Object.entries(state.allUsers).filter(([,u])=>u.role!=='admin');
  if(!colabs.length){ box.innerHTML='<p style="color:var(--text-muted);font-size:.875rem">Nenhum colaborador.</p>'; return; }
  box.innerHTML=colabs.map(([uid,u])=>
    `<div class="colab-item" style="${u.blocked?'opacity:.7':''}">
       <div><strong>${esc(u.nome)}</strong>
         ${u.blocked?'<span style="margin-left:.5rem;font-size:.7rem;background:rgba(239,68,68,.12);color:var(--danger);padding:.1rem .4rem;border-radius:999px">🔒 Bloqueado</span>':''}
         <br><small style="color:var(--text-muted)">${esc(u.email)}</small></div>
       <div style="display:flex;gap:.4rem;flex-wrap:wrap">
         <button class="btn ${u.blocked?'btn-success':'btn-warning'}" style="padding:.3rem .65rem;font-size:.72rem" onclick="toggleBloqueio('${uid}',${u.blocked})">${u.blocked?'✅ Desbloquear':'🔒 Bloquear'}</button>
         <button class="btn btn-danger" style="padding:.3rem .65rem;font-size:.72rem" onclick="removeColab('${uid}')">Remover</button>
       </div>
     </div>`).join('');
}

function colabSidebarHTML(colabs){
  if(!colabs.length) return '<p style="color:var(--text-muted);font-size:.8rem;padding:.5rem">Nenhum colaborador.</p>';
  if(state.adminSelectedUid && state.allUsers[state.adminSelectedUid]){
    const u=state.allUsers[state.adminSelectedUid], n=(u.obras||[]).length;
    return `<button class="btn btn-sec" onclick="adminDeselectColab()" style="width:100%;margin-bottom:.75rem;font-size:.8rem">← Todos</button>
       <div class="colab-sidebar-item active">
         <div style="font-weight:600;font-size:.875rem">${u.blocked?'🔒 ':''}${esc(u.nome)}</div>
         <div style="font-size:.75rem;color:var(--text-muted)">${n} obra${n!==1?'s':''}</div>
       </div>`;
  }
  return colabs.map(([uid,u])=>
    `<div class="colab-sidebar-item" style="${u.blocked?'opacity:.55':''}" onclick="adminSelectColab('${uid}')">
       <div style="font-weight:600;font-size:.875rem">${u.blocked?'🔒 ':''}${esc(u.nome)}</div>
       <div style="font-size:.75rem;color:var(--text-muted)">${(u.obras||[]).length} obra${(u.obras||[]).length!==1?'s':''}</div>
     </div>`).join('');
}

export function renderAdminSidebar(){
  const colabs=Object.entries(state.allUsers).filter(([,u])=>u.role!=='admin');
  const html=colabSidebarHTML(colabs);
  const box=$('adminColabSidebar'); if(box) box.innerHTML=html;
  const mob=$('adminColabSidebarMobile'); if(mob) mob.innerHTML=html;
}

export function adminObraCardHTML(obra){
  const it=Array.isArray(obra.itens)?obra.itens:[];
  const vc=Number(obra.resumo?.valorContratoAditivo)||it.reduce((a,i)=>a+Number(i.valorContrato||0),0);
  const ac=Number(obra.resumo?.acumuladoTotal)||it.reduce((a,i)=>a+Number(i.acumulado||0),0);
  const p=calcPctGeral(obra.resumo,it);
  return `<div class="obra-card" style="cursor:pointer" onclick="adminSelectObra('${obra.id}')">
    <div class="obra-card-header">
      <div><div class="obra-card-title">${esc(obra.nome||'Sem nome')}</div>
      <div class="obra-card-sub">${it.length} itens | Aba: ${esc(obra.medicaoAtual||'-')}</div></div>
      <div class="obra-card-pct">${pct(p)}</div></div>
    <div class="obra-progress-bar"><div class="obra-progress-fill" style="width:${Math.min(100,p)}%"></div></div>
    <div class="obra-card-footer">
      <span>CT/Aditivo: ${money(vc)}</span><span>Acumulado: ${money(ac)}</span><span>Saldo: ${money(vc-ac)}</span>
    </div></div>`;
}

export function renderAdminDetail(){
  const panel=$('adminDetailPanel'); if(!panel) return;
  if(!state.adminSelectedUid){ panel.innerHTML='<p style="color:var(--text-muted);padding:1rem">Selecione um colaborador ao lado.</p>'; return; }
  const u=state.allUsers[state.adminSelectedUid];
  if(!u){ panel.innerHTML=''; return; }
  const obrasList=u.obras||[];
  let html=`<div style="display:flex;align-items:center;gap:1rem;flex-wrap:wrap;margin-bottom:1.5rem">
    <div style="font-weight:700;font-size:1.1rem">👤 ${esc(u.nome)}${u.blocked?' <span style="font-size:.75rem;background:rgba(239,68,68,.12);color:var(--danger);padding:.2rem .6rem;border-radius:999px">🔒</span>':''}</div>
    <div class="form-group" style="margin:0;min-width:220px">
      <select id="adminObraSelect" class="form-control" onchange="adminSelectObra(this.value)">
        <option value="">-- Selecione uma obra --</option>
        ${obrasList.map(o=>`<option value="${o.id}" ${o.id===state.adminSelectedObraId?'selected':''}>${esc(o.nome||'Obra')}</option>`).join('')}
      </select></div></div>`;
  if(!state.adminSelectedObraId||!obrasList.length){
    panel.innerHTML=html+(obrasList.length?obrasList.map(adminObraCardHTML).join(''):'<p style="color:var(--text-muted)">Sem obras.</p>');
    return;
  }
  const obra=obrasList.find(o=>o.id===state.adminSelectedObraId);
  if(!obra){ panel.innerHTML=html+'<p style="color:var(--text-muted)">Obra não encontrada.</p>'; return; }
  const it=Array.isArray(obra.itens)?obra.itens:[];
  const vc=Number(obra.resumo?.valorContratoAditivo)||it.reduce((a,i)=>a+Number(i.valorContrato||0),0);
  const ac=Number(obra.resumo?.acumuladoTotal)||it.reduce((a,i)=>a+Number(i.acumulado||0),0);
  const p=calcPctGeral(obra.resumo,it);
  const tMed=it.reduce((a,i)=>a+Number(i.medicao||0),0);
  const contratadaNome=obra.contratada||'-';
  html+=
    `<div class="admin-stats-grid">
       <div class="stat-card compact"><span class="stat-label">Valor CT / Aditivo</span><span class="stat-value">${money(vc)}</span></div>
       <div class="stat-card compact"><span class="stat-label">Acumulado Total</span><span class="stat-value" style="color:var(--success)">${money(ac)}</span></div>
       <div class="stat-card compact"><span class="stat-label">% Geral</span><span class="stat-value">${pct(p)}</span></div>
       <div class="stat-card compact"><span class="stat-label">Medição Atual</span><span class="stat-value">${esc(obra.medicaoAtual||'-')}</span></div>
       <div class="stat-card compact"><span class="stat-label">Contratada</span><span class="stat-value" style="font-size:.85rem;word-break:break-word">${esc(contratadaNome)}</span></div>
       <div class="stat-card compact"><span class="stat-label">Medição</span><span class="stat-value">${money(tMed)}</span></div>
       <div class="stat-card compact"><span class="stat-label">Saldo</span><span class="stat-value">${money(vc-ac)}</span></div>
     </div>
     <div class="panel" style="margin-bottom:1.5rem">
       <h3 style="margin-bottom:1rem">Curva S — Progresso Físico</h3>
       <div class="chart-scroll-wrap" id="adminCurvaSwrap"><div class="chart-container"><canvas id="adminCurvaS"></canvas></div></div>
     </div>
     <div class="panel">
       <h3 style="margin-bottom:1rem">Índice de Itens</h3>
       <div class="table-container"><table>
         <thead><tr>
           <th class="th-sticky" data-label="ITEM" data-full="Item"></th>
           <th class="th-sticky" data-label="DESCRIÇÃO" data-full="Descrição"></th>
           <th class="th-sticky" style="text-align:right" data-label="VALOR CT" data-full="Valor Contrato"></th>
           <th class="th-sticky" style="text-align:right" data-label="MED" data-full="Medição"></th>
           <th class="th-sticky" style="text-align:right" data-label="ACUMUL" data-full="Acumulado"></th>
           <th class="th-sticky" style="text-align:right" data-label="SALDO" data-full="Saldo"></th>
           <th class="th-sticky" style="text-align:right" data-label="%" data-full="% Exec."></th>
         </tr></thead>
         <tbody>${it.map(r=>{
           const rp=Number(r.percentualExecutado||0);
           const rpc=rp>=99.95?'color:var(--success);font-weight:700':'font-weight:700';
           return `<tr>
           <td>${esc(r.item)}</td><td class="td-desc">${esc(r.descricao)}</td>
           <td style="text-align:right">${money(r.valorContrato)}</td>
           <td style="text-align:right">${money(r.medicao)}</td>
           <td style="text-align:right">${money(r.acumulado)}</td>
           <td style="text-align:right">${money(r.saldo)}</td>
           <td style="text-align:right;${rpc}">${rp.toFixed(2)}%</td>
         </tr>`;
         }).join('')}</tbody>
       </table></div>
     </div>`;
  panel.innerHTML=html;
  requestAnimationFrame(()=>{ state.chartAdmin=renderCurvaS('adminCurvaS','adminCurvaSwrap',it,state.chartAdmin); });
}

export function renderAdminViews(){ renderAdminStats(); renderAdminSidebar(); renderColabList(); }
