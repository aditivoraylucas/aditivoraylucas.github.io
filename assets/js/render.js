import { $, state, esc, money, pct, calcPctGeral, showToast } from './state.js';
import { db } from './firebase.js';
import { registrarEvento } from './auditoria.js';
import { setObraIdNaUrl, limparObraIdDaUrl } from './url-state.js';
import { doc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { renderCurvaS1, renderCurvaS2, renderCurvaS2Aditivo } from './render-charts.js';
import { renderCurvasPorServico } from './render-servicos.js';
import { renderAdminStats, renderAdminSidebar, renderColabList, renderAdminDetail, renderAdminViews, adminObraCardHTML } from './render-admin.js';
import { renderObrasBox, renderCronogramaBox, renderCronogramaMensalBox, renderAditivosSection, setImportFileFnObras } from './render-obras.js';

export { renderCurvaS1, renderCurvaS2, renderCurvaS2Aditivo };
export { renderAdminStats, renderAdminSidebar, renderColabList, renderAdminDetail, renderAdminViews, adminObraCardHTML };
export { renderCurvasPorServico };
export { renderObrasBox, renderCronogramaBox, renderCronogramaMensalBox, renderAditivosSection };

export async function saveObra(obra){
  if(!state.user?.uid) return;
  await setDoc(doc(db,'users',state.user.uid,'obras',obra.id),obra);
}
export async function deleteObra(id){
  if(!state.user?.uid) return;
  const obraRef=doc(db,'users',state.user.uid,'obras',id);
  const snapshot=state.obras.find(o=>o.id===id)??null;
  await updateDoc(obraRef,{deletedAt:serverTimestamp()});
  await registrarEvento({uid:state.user.uid,entidade:'obras',docId:id,acao:'OBRA_REMOVIDA',snapshotAntes:snapshot});
}
export function scheduleSave(){
  clearTimeout(state.saveTimer);
  state.saveTimer=setTimeout(async()=>{
    const o=currentObra();
    if(o){ o.itens=state.rows; await saveObra(o); }
  },1200);
}
export function currentObra(){
  return state.obras.find(o=>o.id===state.selectedObraId);
}
export function applySelected(o){
  state.rows=Array.isArray(o.itens)?o.itens:[];
  const pn=$('projName');       if(pn) pn.value=o.nomeProjeto||o.nome||'Nova obra';
  const pc=$('projContratada'); if(pc) pc.value=o.contratada||'';
  const ps=$('projScope');      if(ps) ps.value=o.medicaoAtual||'';
  const di=$('projDataInicio'); if(di) di.value=o.dataInicio||'';
  setObraIdNaUrl(o.id);
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
      <td style="text-align:right"><button data-del="${i}" class="btn btn-danger" style="padding:.4rem;border-radius:6px">\u{1F5D1}</button></td>
    </tr>`;
  }).join('');
}

function fmtDate(str){ if(!str) return '-'; const d=new Date(str+'T00:00:00'); return isNaN(d)?str:d.toLocaleDateString('pt-BR'); }
function calcDataFim(dataInicio,totalMeses){
  if(!dataInicio||!totalMeses) return null;
  const [ano,mes,dia]=dataInicio.split('-').map(Number);
  const mesBase0=(mes-1)+totalMeses;
  const fimAno=ano+Math.floor(mesBase0/12), fimMes=(mesBase0%12)+1;
  return `${fimAno}-${String(fimMes).padStart(2,'0')}-${String(Math.min(dia,new Date(fimAno,fimMes,0).getDate())).padStart(2,'0')}`;
}
function calcDataInicioProximo(dataInicio,totalMeses){
  if(!dataInicio||!totalMeses) return dataInicio||null;
  const [ano,mes]=dataInicio.split('-').map(Number);
  const base0=(mes-1)+totalMeses;
  return `${ano+Math.floor(base0/12)}-${String((base0%12)+1).padStart(2,'0')}-01`;
}

export function renderAditivosCurvas(){
  const container=$('aditivosCurvasContainer'); if(!container) return;
  const o=currentObra();
  if(!o){ container.innerHTML=''; return; }
  const aditivos=Array.isArray(o.aditivos)?o.aditivos:[];
  const nContrato=Array.isArray(o.cronograma)?o.cronograma.length:0;
  let dataInicioBase=calcDataInicioProximo(o.dataInicio,nContrato);
  if(!state._aditivoCharts) state._aditivoCharts={};
  Object.values(state._aditivoCharts).forEach(c=>{ try{ c.destroy(); }catch(_){} });
  state._aditivoCharts={};
  container.innerHTML='';
  aditivos.forEach((ad)=>{
    const nPrev=Array.isArray(ad.cronograma)?ad.cronograma.length:0;
    const dataInicioAd=dataInicioBase;
    dataInicioBase=calcDataInicioProximo(dataInicioBase,nPrev)||dataInicioBase;
    if(!nPrev&&!(Array.isArray(ad.cronogramaExecucao)&&ad.cronogramaExecucao.length)) return;
    const canvasId=`curvaS_aditivo_${ad.id}`, wrapId=`curvaS_aditivo_wrap_${ad.id}`;
    const dataFimStr=(nPrev&&dataInicioAd)?fmtDate(calcDataFim(dataInicioAd,nPrev)):null;
    const panel=document.createElement('div');
    panel.className='panel'; panel.style.marginBottom='1.5rem';
    panel.innerHTML=`
      <div style="display:flex;align-items:baseline;gap:.75rem;margin-bottom:1rem;flex-wrap:wrap">
        <h3 style="font-size:.95rem;font-weight:700;margin:0">Curva S \u2014 ${esc(ad.nome||'Aditivo')}</h3>
        ${dataFimStr?`<span style="font-size:.75rem;color:var(--text-muted)">\u{1F3C1} T\u00e9rmino: <strong>${dataFimStr}</strong></span>`:''}
      </div>
      <div class="chart-scroll-wrap" id="${wrapId}"><div class="chart-container"><canvas id="${canvasId}"></canvas></div></div>`;
    container.appendChild(panel);
    requestAnimationFrame(()=>{
      state._aditivoCharts[ad.id]=renderCurvaS2Aditivo(canvasId,wrapId,ad,dataInicioAd,state._aditivoCharts[ad.id]||null);
    });
  });
}

/* ── Curvas S por Servico: monta fontes e seletor ── */
function _buildFontesServico(o) {
  const fontes = [];
  const aditivos = Array.isArray(o?.aditivos) ? o.aditivos : [];
  const nContrato = Array.isArray(o?.cronograma) ? o.cronograma.length : 0;

  // Fonte 0: contrato inicial
  const itensCronoContrato = Array.isArray(o?.cronogramaItens) ? o.cronogramaItens : [];
  if (itensCronoContrato.length && nContrato && o?.dataInicio) {
    fontes.push({
      label: '\u{1F4CB} Contrato inicial',
      itensCrono:        itensCronoContrato,
      itensExecMensal:   Array.isArray(o?.cronogramaItensExecucao) ? o.cronogramaItensExecucao : [],
      itensExecucao:     Array.isArray(o?.itens) ? o.itens : [],
      totalMeses:        nContrato,
      dataInicio:        o.dataInicio,
      dataEmissaoRef:    o?.dataEmissaoExecucao || o?.dataEmissao || null,
      historicoExecucao: Array.isArray(o?.historicoExecucao) ? o.historicoExecucao : []
    });
  }

  // Fontes 1..N: aditivos com cronogramaItens
  // dataInicioBase avanca em cadeia: contrato -> ad[0] -> ad[1] -> ...
  let dataInicioBase = calcDataInicioProximo(o?.dataInicio, nContrato);
  aditivos.forEach((ad, adIdx) => {
    const dataInicioAd  = dataInicioBase;
    const totalMesesAd  = Array.isArray(ad.cronograma) ? ad.cronograma.length : 0;
    // avanca para o proximo aditivo independente de ter cronogramaItens
    dataInicioBase = calcDataInicioProximo(dataInicioBase, totalMesesAd) || dataInicioBase;

    const itensCronoAd = Array.isArray(ad?.cronogramaItens) ? ad.cronogramaItens : [];
    if (!itensCronoAd.length || !totalMesesAd || !dataInicioAd) return;

    fontes.push({
      label:             `\u{1F4C4} ${esc(ad.nome || `Aditivo ${adIdx + 1}`)}`,
      itensCrono:        itensCronoAd,
      // execucao mensal do proprio aditivo (previsto x mensal do aditivo)
      itensExecMensal:   Array.isArray(ad?.cronogramaItensExecucao) ? ad.cronogramaItensExecucao : [],
      // fallback de % acumulado vem dos itens da obra (boletim)
      itensExecucao:     Array.isArray(o?.itens) ? o.itens : [],
      totalMeses:        totalMesesAd,
      dataInicio:        dataInicioAd,
      // referencia de emissao: data do mensal do aditivo, fallback data do previsto do aditivo
      dataEmissaoRef:    ad?.dataEmissaoExecucao || ad?.dataEmissao || null,
      historicoExecucao: Array.isArray(ad?.historicoExecucao) ? ad.historicoExecucao : []
    });
  });

  return fontes;
}

export function renderCurvasPorServicoPanel(o, prefix) {
  const painel = $('curvasPorServicoPanel');
  const badge  = $('curvasPorServicoBadge');
  const container = $('curvasPorServicoContainer');
  if (!painel || !container) return;

  const fontes = _buildFontesServico(o);
  if (!fontes.length) { painel.style.display = 'none'; return; }
  painel.style.display = '';

  const totalServicos = fontes[0].itensCrono.length;
  const temMensal = fontes.some(f => f.itensExecMensal.length > 0);
  if (badge) badge.textContent =
    `${totalServicos} servi\u00e7os` +
    (temMensal ? ' \u2022 Real m\u00eas a m\u00eas' : '') +
    (fontes.length > 1 ? ` \u2022 ${fontes.length - 1} aditivo(s)` : '');

  // seletor de fonte (so aparece se houver mais de 1 fonte)
  let seletorEl = $(`${prefix}_fonte_seletor`);
  if (!seletorEl) {
    seletorEl = document.createElement('div');
    seletorEl.id = `${prefix}_fonte_seletor`;
    seletorEl.style.cssText = 'display:flex;gap:.4rem;flex-wrap:wrap;margin-bottom:1rem';
    container.parentElement.insertBefore(seletorEl, container);
  }

  if (fontes.length > 1) {
    seletorEl.style.display = 'flex';
    seletorEl.innerHTML = fontes.map((f, i) => {
      const ativo = i === (state[`${prefix}_fonteAtiva`] ?? 0);
      return `<button
        data-fonte-idx="${i}"
        style="padding:.35rem .85rem;border-radius:999px;border:1px solid ${ativo ? 'var(--primary,#6366f1)' : 'var(--border,#e2e8f0)'};font-size:.75rem;font-weight:600;cursor:pointer;background:${ativo ? 'var(--primary,#6366f1)' : 'transparent'};color:${ativo ? '#fff' : 'var(--text-muted,#64748b)'};transition:all .15s"
        onclick="window._trocarFonteServico && window._trocarFonteServico(${i})"
      >${f.label}</button>`;
    }).join('');
  } else {
    seletorEl.style.display = 'none';
  }

  // expoe funcao de troca para o onclick inline
  window._trocarFonteServico = (idx) => {
    state[`${prefix}_fonteAtiva`] = idx;
    const sel = $(`${prefix}_fonte_seletor`);
    if (sel) sel.querySelectorAll('[data-fonte-idx]').forEach(btn => {
      const ativo = Number(btn.dataset.fonteIdx) === idx;
      btn.style.background  = ativo ? 'var(--primary,#6366f1)' : 'transparent';
      btn.style.color       = ativo ? '#fff' : 'var(--text-muted,#64748b)';
      btn.style.borderColor = ativo ? 'var(--primary,#6366f1)' : 'var(--border,#e2e8f0)';
    });
    renderCurvasPorServico('curvasPorServicoContainer', fontes[idx], `${prefix}_f${idx}`);
  };

  // renderiza fonte ativa (padrao: 0)
  const idxAtivo = state[`${prefix}_fonteAtiva`] ?? 0;
  renderCurvasPorServico('curvasPorServicoContainer', fontes[idxAtivo], `${prefix}_f${idxAtivo}`);
}

export function updateDashboard(){
  const o=currentObra();
  const itens=Array.isArray(o?.itens)&&o.itens.length>0?o.itens:state.rows;
  const vc=Number(o?.resumo?.valorContratoAditivo)||itens.reduce((a,r)=>a+Number(r.valorContrato||0),0);
  const ac=Number(o?.resumo?.acumuladoTotal)      ||itens.reduce((a,r)=>a+Number(r.acumulado||0),0);
  const estaMed=Number(o?.resumo?.estaMedicao)    ||itens.reduce((a,r)=>a+Number(r.medicao||0),0);
  const p=calcPctGeral(o?.resumo,itens);
  const LS='font-size:.7rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--text-muted)';
  const VS='font-size:.95rem;font-weight:700;margin-top:.2rem';
  if($('stats')) $('stats').innerHTML=
    `<div class="stat-card"><span class="stat-label" style="${LS}">Esta Medi\u00e7\u00e3o</span><span class="stat-value" style="${VS}">${money(estaMed)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Valor CT / Aditivo</span><span class="stat-value" style="${VS}">${money(vc)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">Acumulado Total</span><span class="stat-value" style="${VS};color:var(--success)">${money(ac)}</span></div>
     <div class="stat-card"><span class="stat-label" style="${LS}">% Geral</span><span class="stat-value" style="${VS}">${pct(p)}</span></div>`;
  if($('mainProjName'))       $('mainProjName').textContent      =o?.nomeProjeto||o?.nome||'-';
  if($('mainProjContratada')) $('mainProjContratada').textContent=o?.contratada||'-';
  if($('mainProjScope'))      $('mainProjScope').textContent     =o?.medicaoAtual||'-';
  state.chartUser=renderCurvaS1('sCurveChart','sCurveScrollWrap',itens,state.chartUser);
  const temCrono=Array.isArray(o?.cronograma)&&o.cronograma.length>0;
  const temMensal=Array.isArray(o?.cronogramaExecucao)&&o.cronogramaExecucao.length>0;
  const panelS2=$('sCurveAditivoPanel');
  if(temCrono&&temMensal){
    if(panelS2) panelS2.style.display='';
    requestAnimationFrame(()=>{ state.chartUser2=renderCurvaS2('sCurveAditivoChart','sCurveAditivoScrollWrap',o,state.chartUser2); });
  } else {
    if(panelS2) panelS2.style.display='none';
    if(state.chartUser2){ try{ state.chartUser2.destroy(); }catch(_){} state.chartUser2=null; }
  }
  renderAditivosCurvas();
  renderCurvasPorServicoPanel(o, 'colab');
  const cronoStatus=$('cronoStatus');
  if(cronoStatus){
    if(temCrono&&o?.dataInicio){
      const dataFim=calcDataFim(o.dataInicio,o.cronograma.length);
      const dias=dataFim?Math.ceil((new Date(dataFim+'T00:00:00')-new Date())/86400000):null;
      if(dias!==null){
        const cor=dias<0?'var(--danger)':dias<30?'#f59e0b':'var(--success)';
        const txt=dias<0?`\u26a0\ufe0f Prazo vencido h\u00e1 ${Math.abs(dias)} dias`:dias===0?'\u{1F3C1} T\u00e9rmino hoje':`\u{1F5D3}\uFE0F ${dias} dias restantes`;
        cronoStatus.innerHTML=`<span style="color:${cor};font-weight:600">${txt}</span>`;
      } else { cronoStatus.innerHTML=''; }
    } else { cronoStatus.innerHTML=''; }
  }
}

export function renderAll(){ renderObrasBox(); renderTable(); updateDashboard(); }
let importFileFn=()=>{};
export function setImportFileFn(fn){ importFileFn=fn; setImportFileFnObras(fn); }
