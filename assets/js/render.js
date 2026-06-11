import { $, state, esc, money, pct, calcPctGeral, buildCronogramaTimeline } from './state.js';
import { db } from './firebase.js';
import { doc, setDoc, deleteDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

export async function saveObra(obra){ await setDoc(doc(db,'users',state.user.uid,'obras',obra.id), obra); }
export async function deleteObra(id){ await deleteDoc(doc(db,'users',state.user.uid,'obras',id)); }
export function scheduleSave(){
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async()=>{ const o=currentObra(); if(o){ o.itens=state.rows; await saveObra(o); } }, 1200);
}
export function currentObra(){ return state.obras.find(o => o.id === state.selectedObraId); }

/* ---- helpers de data ---- */
function fmtDate(str){
  if(!str) return '-';
  const d = new Date(str + 'T00:00:00');
  return isNaN(d) ? str : d.toLocaleDateString('pt-BR');
}

/**
 * Calcula a data de término da obra.
 * REGRA: o DIA do término é sempre igual ao DIA do início.
 * Os meses são completos: início 10/06/2026 + 12 meses = 10/06/2027.
 */
function calcDataFim(dataInicio, totalMeses){
  if(!dataInicio || !totalMeses) return null;
  const [ano, mes, dia] = dataInicio.split('-').map(Number);
  // mes-1 converte para base-0; soma totalMeses completos (o mês do início não é consumido)
  const mesBase0  = (mes - 1) + totalMeses;
  const fimAno    = ano + Math.floor(mesBase0 / 12);
  const fimMes    = (mesBase0 % 12) + 1;           // 1-based
  const ultimoDia = new Date(fimAno, fimMes, 0).getDate();
  const fimDia    = Math.min(dia, ultimoDia);
  return `${fimAno}-${String(fimMes).padStart(2,'0')}-${String(fimDia).padStart(2,'0')}`;
}

/* ════════════════════════════════════════════════════════════
   renderCurvaS
   - SEM cronograma  → gráfico de barras simples (inalterado)
   - COM cronograma  → Curva S aprimorada:
       • Planejado acumulado (linha âmbar)
       • Executado real ponderado (linha verde)
       • Área de desvio colorida (verde=adiantado / vermelho=atrasado)
       • Linha vertical "Hoje" com anotação
       • Tooltip rico: Planejado / Executado / Desvio
   ════════════════════════════════════════════════════════════ */
export function renderCurvaS(canvasId, wrapId, itens, prev, cronogramaData, dataInicio){
  const canvas=$(canvasId); if(!canvas) return prev;
  if(prev) prev.destroy();

  const dark   = document.documentElement.dataset.theme === 'dark';
  const gc     = dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)';
  const tc     = dark ? '#94a3b8' : '#64748b';
  const mobile = window.innerWidth <= 900;
  const wrap   = $(wrapId);
  if(wrap){ wrap.style.overflowX='hidden'; canvas.style.minWidth=''; canvas.style.width='100%'; }

  /* ── Modo SEM cronograma: barras simples (não muda) ── */
  const di       = dataInicio || currentObra()?.dataInicio;
  const timeline = (cronogramaData && di) ? buildCronogramaTimeline(di, cronogramaData) : null;

  if(!timeline || !timeline.length){
    const n         = itens.length;
    const containerW= wrap ? wrap.offsetWidth : 600;
    const thickness = mobile
      ? Math.max(4, Math.floor((containerW-16)/(n||1))-2)
      : Math.max(18, Math.min(40, Math.floor(600/(n||1))));
    return new Chart(canvas.getContext('2d'),{
      type:'bar',
      data:{
        labels: itens.map(r=>String(r.item||'')),
        datasets:[{
          type:'bar', label:'% Executado',
          data: itens.map(r=>Number(r.percentualExecutado)||0),
          backgroundColor:'rgba(99,102,241,0.2)', borderColor:'#6366f1',
          borderWidth:1, borderRadius:3,
          barThickness: mobile?'flex':thickness, order:2
        }]
      },
      options:{
        responsive:true, maintainAspectRatio:false,
        scales:{
          y:{beginAtZero:true,max:100,grid:{color:gc},ticks:{color:tc,callback:v=>v+'%'}},
          x:{grid:{display:false},ticks:{color:tc,font:{size:mobile?8:10},maxRotation:mobile?90:45,minRotation:0}}
        },
        plugins:{legend:{labels:{color:tc}}}
      }
    });
  }

  /* ── Modo COM cronograma: Curva S aprimorada ── */
  const totalVC  = itens.reduce((a,r)=>a+(Number(r.valorContrato)||0),0);
  const totalAcu = itens.reduce((a,r)=>a+(Number(r.acumulado)||0),0);
  const realPctGeral = totalVC > 0 ? +(totalAcu/totalVC*100).toFixed(2) : 0;

  // Planejado acumulado
  let acumPlan = 0;
  const planData = timeline.map(t=>{ acumPlan += t.planejadoPct; return +Math.min(acumPlan,100).toFixed(2); });

  // Executado real ponderado: distribui realPctGeral proporcional ao planejado de cada mês
  const planTotal = planData[planData.length-1] || 100;
  const realData  = timeline.map((t,i)=>{
    if(!t.passado) return null;
    const pesoAcum = planTotal > 0 ? planData[i] / planTotal : (i+1)/timeline.length;
    return +Math.min(realPctGeral * (pesoAcum > 0 ? 1 : 0) + realPctGeral*(1-pesoAcum)*0, 100).toFixed(2);
  });

  // Versão correta: distribui linearmente dentro dos meses passados, chegando em realPctGeral no último mês passado
  const passadoCount = timeline.filter(t=>t.passado).length;
  const realDataFinal = timeline.map((t,i)=>{
    if(!t.passado) return null;
    const fracaoMes = (i+1)/passadoCount;
    return +Math.min(realPctGeral * fracaoMes, 100).toFixed(2);
  });

  // Índice do mês atual (último "passado")
  const hojeIdx = timeline.reduce((last,t,i)=> t.passado ? i : last, -1);

  // Área de desvio
  const desvioData = timeline.map((t,i)=>{
    if(realDataFinal[i] === null) return null;
    return +( realDataFinal[i] - planData[i] ).toFixed(2);
  });

  const labels = timeline.map(t=>t.label);

  // Plugin: linha vertical "Hoje"
  const pluginHoje = {
    id: 'linhaHoje',
    afterDraw(chart){
      if(hojeIdx < 0) return;
      const { ctx, chartArea:{ top, bottom }, scales:{ x } } = chart;
      const xPos = x.getPixelForValue(hojeIdx);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(xPos, top);
      ctx.lineTo(xPos, bottom);
      ctx.lineWidth   = 2;
      ctx.strokeStyle = dark ? 'rgba(248,113,113,0.9)' : 'rgba(220,38,38,0.8)';
      ctx.setLineDash([5,4]);
      ctx.stroke();
      ctx.setLineDash([]);
      const label   = 'Hoje';
      const padding = 4;
      ctx.font      = `bold ${mobile?9:11}px sans-serif`;
      const tw      = ctx.measureText(label).width;
      const bw      = tw + padding*2;
      const bh      = mobile ? 14 : 18;
      const bx      = xPos - bw/2;
      const by      = top + 4;
      ctx.fillStyle = dark ? 'rgba(220,38,38,0.85)' : 'rgba(239,68,68,0.9)';
      roundRect(ctx, bx, by, bw, bh, 4);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.textAlign    = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, xPos, by + bh/2);
      ctx.restore();
    }
  };

  function roundRect(ctx, x, y, w, h, r){
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.lineTo(x+w-r, y);
    ctx.quadraticCurveTo(x+w, y, x+w, y+r);
    ctx.lineTo(x+w, y+h-r);
    ctx.quadraticCurveTo(x+w, y+h, x+w-r, y+h);
    ctx.lineTo(x+r, y+h);
    ctx.quadraticCurveTo(x, y+h, x, y+h-r);
    ctx.lineTo(x, y+r);
    ctx.quadraticCurveTo(x, y, x+r, y);
    ctx.closePath();
  }

  const desvioHoje = hojeIdx >= 0 ? (desvioData[hojeIdx] ?? 0) : 0;
  const desvioColor  = desvioHoje >= 0
    ? (dark ? 'rgba(52,211,153,0.18)' : 'rgba(16,185,129,0.15)')
    : (dark ? 'rgba(248,113,113,0.18)' : 'rgba(239,68,68,0.12)');
  const desvioBorder = desvioHoje >= 0 ? 'rgba(16,185,129,0)' : 'rgba(239,68,68,0)';

  const datasets = [
    {
      type:'line', label: desvioHoje >= 0 ? 'Adiantamento' : 'Atraso',
      data: desvioData.map((v,i)=> v !== null ? planData[i] : null),
      borderColor: 'transparent',
      backgroundColor: desvioColor,
      fill: { target: '+1', above: desvioColor, below: desvioColor },
      pointRadius: 0, tension: 0.35, order: 3,
      spanGaps: false
    },
    {
      type:'line', label:'Executado Real (%)',
      data: realDataFinal,
      borderColor:'#10b981', backgroundColor:'rgba(16,185,129,0.08)',
      borderWidth: 2.5, pointRadius: mobile?2:4,
      pointBackgroundColor:'#10b981',
      tension: 0.35, fill: false, spanGaps: false, order: 1
    },
    {
      type:'line', label:'Planejado (%)',
      data: planData,
      borderColor:'#f59e0b', backgroundColor:'rgba(245,158,11,0.06)',
      borderWidth: 2.5, pointRadius: mobile?2:4,
      pointBackgroundColor:'#f59e0b',
      tension: 0.35, fill: false, order: 0
    }
  ];

  return new Chart(canvas.getContext('2d'),{
    type:'line',
    data:{ labels, datasets },
    plugins:[ pluginHoje ],
    options:{
      responsive: true,
      maintainAspectRatio: false,
      interaction:{ mode:'index', intersect:false },
      scales:{
        y:{
          beginAtZero:true, max:100,
          grid:{ color:gc },
          ticks:{ color:tc, callback: v=>v+'%', font:{ size: mobile?9:11 } }
        },
        x:{
          grid:{ display:false },
          ticks:{ color:tc, font:{ size:mobile?8:10 }, maxRotation: mobile?90:45, minRotation:0 }
        }
      },
      plugins:{
        legend:{
          labels:{
            color: tc,
            font:{ size: mobile?9:11 },
            usePointStyle: true,
            pointStyleWidth: 10,
            filter: item => item.text !== 'Adiantamento' && item.text !== 'Atraso'
              ? true
              : (hojeIdx >= 0)
          }
        },
        tooltip:{
          callbacks:{
            title: items => `📅 ${items[0].label}`,
            label: item => {
              if(item.datasetIndex === 0) return null;
              const v = item.parsed.y;
              if(v === null || v === undefined) return null;
              const prefix = item.datasetIndex === 1 ? '🟢 Executado' : '🟡 Planejado';
              return ` ${prefix}: ${Number(v).toFixed(1)}%`;
            },
            afterBody: items => {
              const planVal  = items.find(i=>i.datasetIndex===2)?.parsed.y;
              const realVal  = items.find(i=>i.datasetIndex===1)?.parsed.y;
              if(planVal == null || realVal == null) return [];
              const dev = +(realVal - planVal).toFixed(1);
              const icon = dev >= 0 ? '✅' : '⚠️';
              const txt  = dev >= 0 ? `Adiantado ${dev}%` : `Atrasado ${Math.abs(dev)}%`;
              return [`─────────────`, ` ${icon} ${txt}`];
            }
          },
          backgroundColor: dark ? '#1e293b' : '#fff',
          titleColor:       dark ? '#f8fafc' : '#0f172a',
          bodyColor:        dark ? '#94a3b8' : '#475569',
          borderColor:      dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1,
          padding: 10,
          cornerRadius: 8
        }
      }
    }
  });
}

export function applySelected(o){
  state.rows=Array.isArray(o.itens)?o.itens:[];
  const pn=$('projName'); if(pn) pn.value=o.nomeProjeto||o.nome||'Nova obra';
  const pc=$('projContratada'); if(pc) pc.value=o.contratada||'';
  const ps=$('projScope'); if(ps) ps.value=o.medicaoAtual||'';
  const di=$('projDataInicio'); if(di) di.value=o.dataInicio||'';
}

export function renderTable(){
  const tbody=$('tbody'); if(!tbody) return;
  tbody.innerHTML=state.rows.map((r,i)=>{
    const p=Number(r.percentualExecutado||0);
    const pctColor=p>=99.95?'color:var(--success);font-weight:700':'font-weight:700';
    return `<tr data-i="${i}">
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

/* ── Painel de Cronograma no aside ── */
export function renderCronogramaBox(){
  const box=$('cronogramaBox'); if(!box) return;
  const o=currentObra();
  if(!o){
    box.innerHTML='<p style="color:var(--text-muted);font-size:.8rem">Selecione uma obra para gerenciar o cronograma.</p>';
    return;
  }
  const temCrono = Array.isArray(o.cronograma) && o.cronograma.length > 0;
  const totalMeses = temCrono ? o.cronograma.length : 0;
  const dataFimStr = (temCrono && o.dataInicio)
    ? fmtDate(calcDataFim(o.dataInicio, totalMeses))
    : null;

  if(temCrono){
    box.innerHTML=
      `<div style="display:flex;flex-direction:column;gap:.35rem">
         <div style="font-size:.8rem;color:var(--text-muted)">📊 <strong style="color:var(--text)">${totalMeses} meses</strong> importados</div>
         ${dataFimStr?`<div style="font-size:.75rem;color:var(--text-muted)">🏁 Término previsto: <strong>${dataFimStr}</strong></div>`:''}
       </div>
       <button id="removeCronogramaBtn" class="btn btn-danger" style="width:100%;margin-top:.6rem;font-size:.8rem">🗑 Remover Cronograma</button>`;
  } else {
    box.innerHTML='<p style="color:var(--text-muted);font-size:.8rem">Nenhum cronograma importado para esta obra.</p>';
  }

  const removeBtn=$('removeCronogramaBtn');
  if(removeBtn) removeBtn.onclick=async()=>{
    if(!confirm('Remover o cronograma desta obra?')) return;
    delete o.cronograma;
    await saveObra(o);
    renderCronogramaBox();
    updateDashboard();
    showToast('✅ Cronograma removido.');
  };
}

import { showToast } from './state.js';

/* ---- Dashboard do colaborador (painel fixo) ---- */
export function updateDashboard(){
  const o=currentObra();
  // Usa o.itens (salvo no Firestore) para a curva S — mesma fonte do admin
  const itensParaCurva = Array.isArray(o?.itens) && o.itens.length > 0 ? o.itens : state.rows;
  const vc     = Number(o?.resumo?.valorContratoAditivo)||state.rows.reduce((a,r)=>a+Number(r.valorContrato||0),0);
  const ac     = Number(o?.resumo?.acumuladoTotal)     ||state.rows.reduce((a,r)=>a+Number(r.acumulado||0),0);
  const estaMed= Number(o?.resumo?.estaMedicao)        ||state.rows.reduce((a,r)=>a+Number(r.medicao||0),0);
  const p      = calcPctGeral(o?.resumo, state.rows);
  const LS = 'font-size:.7rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)';
  const VS = 'font-size:.95rem;font-weight:700;margin-top:.2rem';
  if($('stats')) $('stats').innerHTML=
    `<div class="stat-card"><span class="stat-label" style="${LS}">Esta Medição</span><span class="stat-value" style="${VS}">${money(estaMed)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Valor CT / Aditivo</span><span class="stat-value" style="${VS}">${money(vc)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Acumulado Total</span><span class="stat-value" style="${VS};color:var(--success)">${money(ac)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">% Geral</span><span class="stat-value" style="${VS}">${pct(p)}</span></div>`;
  if($('countAll'))  $('countAll').textContent  = money(vc);
  if($('countDone')) $('countDone').textContent = money(ac);
  if($('countPct'))  $('countPct').textContent  = pct(p);
  if($('mainProjName'))       $('mainProjName').textContent      = o?.nomeProjeto||o?.nome||'-';
  if($('mainProjContratada')) $('mainProjContratada').textContent = o?.contratada||'-';
  if($('mainProjScope'))      $('mainProjScope').textContent      = o?.medicaoAtual||'-';
  state.chartUser=renderCurvaS('sCurveChart','sCurveScrollWrap',itensParaCurva,state.chartUser,o?.cronograma,o?.dataInicio);
}

export function renderObrasBox(){
  const box=$('obrasBox'); if(!box) return;
  if(!state.obras.length){
    box.innerHTML='<p style="color:var(--text-muted);font-size:.8rem">Nenhuma obra cadastrada.</p>';
    renderCronogramaBox();
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
    else{ state.rows=[]; ['projName','projContratada','projScope'].forEach(id=>{const el=$(id);if(el)el.value='';}); }
    renderAll();
  };
  renderCronogramaBox();
}

export function renderAll(){ renderObrasBox(); renderTable(); updateDashboard(); }
let importFileFn = ()=>{};
export function setImportFileFn(fn){ importFileFn = fn; }

/* ── ADMIN ── */

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
  const LS='font-size:.7rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)';
  const VS='font-size:.95rem;font-weight:700;margin-top:.2rem';
  if($('adminStats')) $('adminStats').innerHTML=
    `<div class="stat-card"><span class="stat-label" style="${LS}">Total de Obras</span><span class="stat-value" style="${VS}">${tot}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Soma dos Contratos</span><span class="stat-value" style="${VS}">${money(tvc)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">% Geral</span><span class="stat-value" style="${VS}">${pct(p)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Acumulado Geral</span><span class="stat-value" style="${VS}">${money(tac)}</span></div>`;
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
  if(state.adminSelectedUid&&state.allUsers[state.adminSelectedUid]){
    const u=state.allUsers[state.adminSelectedUid],n=(u.obras||[]).length;
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
  const temCrono=Array.isArray(obra.cronograma)&&obra.cronograma.length>0;
  const temData=!!obra.dataInicio;
  return `<div class="obra-card" style="cursor:pointer" onclick="adminSelectObra('${obra.id}')">
    <div class="obra-card-header">
      <div><div class="obra-card-title">${esc(obra.nome||'Sem nome')}</div>
      <div class="obra-card-sub">${it.length} itens | Aba: ${esc(obra.medicaoAtual||'-')}${temCrono&&temData?' | 📅 Cronograma':''}</div></div>
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
  const it      = Array.isArray(obra.itens)?obra.itens:[];
  const vc      = Number(obra.resumo?.valorContratoAditivo)||it.reduce((a,i)=>a+Number(i.valorContrato||0),0);
  const ac      = Number(obra.resumo?.acumuladoTotal)     ||it.reduce((a,i)=>a+Number(i.acumulado||0),0);
  const estaMed = Number(obra.resumo?.estaMedicao)        ||it.reduce((a,i)=>a+Number(i.medicao||0),0);
  const p       = calcPctGeral(obra.resumo, it);
  const saldo   = vc - ac;
  const contratadaNome = obra.contratada||'-';
  const dataInicioStr  = fmtDate(obra.dataInicio);
  const totalMeses     = Array.isArray(obra.cronograma)?obra.cronograma.length:0;
  const dataFimISO     = calcDataFim(obra.dataInicio, totalMeses);
  const dataFimStr     = dataFimISO ? fmtDate(dataFimISO) : '-';
  const temCrono       = Array.isArray(obra.cronograma)&&obra.cronograma.length>0;
  const LS   = 'font-size:.7rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)';
  const VS   = 'font-size:.95rem;font-weight:700;margin-top:.15rem';
  const VSSM = 'font-size:.82rem;font-weight:700;margin-top:.15rem;word-break:break-word';

  html +=
    `<div class="admin-stats-grid">
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Contratada</span><span class="stat-value" style="${VSSM}">${esc(contratadaNome)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Esta Medição</span><span class="stat-value" style="${VS}">${money(estaMed)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">📅 INÍCIO DA OBRA</span><span class="stat-value" style="${VS}">${dataInicioStr}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">🏁 Término Previsto</span><span class="stat-value" style="${VS}">${dataFimStr}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Valor CT / Aditivo</span><span class="stat-value" style="${VS}">${money(vc)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Acumulado Total</span><span class="stat-value" style="${VS};color:var(--success)">${money(ac)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">Saldo</span><span class="stat-value" style="${VS}">${money(saldo)}</span></div>
       <div class="stat-card compact"><span class="stat-label" style="${LS}">% Geral</span><span class="stat-value" style="${VS}">${pct(p)}</span></div>
     </div>
     <div class="panel" style="margin-bottom:1.5rem">
       <h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">Curva S${temCrono&&obra.dataInicio?' — Planejado vs Executado':' — Progresso Físico'}</h3>
       <div class="chart-scroll-wrap" id="adminCurvaSwrap"><div class="chart-container"><canvas id="adminCurvaS"></canvas></div></div>
     </div>
     <div class="panel">
       <h3 style="margin-bottom:1rem;font-size:.95rem;font-weight:700">Índice de Itens</h3>
       <div class="table-container"><table class="admin-table">
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
             <td style="font-size:.82rem">${esc(r.item)}</td>
             <td class="td-desc" style="font-size:.82rem">${esc(r.descricao)}</td>
             <td style="text-align:right;font-size:.82rem">${money(r.valorContrato)}</td>
             <td style="text-align:right;font-size:.82rem">${money(r.medicao)}</td>
             <td style="text-align:right;font-size:.82rem">${money(r.acumulado)}</td>
             <td style="text-align:right;font-size:.82rem">${money(r.saldo)}</td>
             <td style="text-align:right;font-size:.82rem;${rpc}">${rp.toFixed(2)}%</td>
           </tr>`;
         }).join('')}</tbody>
       </table></div>
     </div>`;
  panel.innerHTML=html;
  requestAnimationFrame(()=>{
    state.chartAdmin=renderCurvaS('adminCurvaS','adminCurvaSwrap',it,state.chartAdmin,obra.cronograma,obra.dataInicio);
  });
}

export function renderAdminViews(){ renderAdminStats(); renderAdminSidebar(); renderColabList(); }
