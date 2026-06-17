import { getObras, saveObra as _saveObra } from './firebase.js';

export const state = {
  obras: [],
  selectedObraId: null,
  user: null,
  role: null
};

export async function loadObras() {
  state.obras = await getObras(state.user.uid);
}

export async function saveObra(obra) {
  if (!state.user?.uid) return;
  await _saveObra(state.user.uid, obra);
  const idx = state.obras.findIndex(o => o.id === obra.id);
  if (idx >= 0) state.obras[idx] = obra;
  else state.obras.push(obra);
}

export function getSelectedObra() {
  return state.obras.find(o => o.id === state.selectedObraId) || null;
}

/* ── buildCronogramaTimeline ─────────────────────────────────────────────────
 *
 * buildCronogramaTimeline(dataInicio, cronograma, dataEmissao?)
 *
 */
export function buildCronogramaTimeline(dataInicio, cronograma, dataEmissao){
  if(!dataInicio||!cronograma) return null;
  const [iniAno,iniMes]=dataInicio.split('-').map(Number);
  let refMes,refAno;
  if(dataEmissao && dataEmissao.mes && dataEmissao.ano){
    refMes = dataEmissao.mes;
    refAno = dataEmissao.ano;
  } else {
    const now=new Date(); refMes=now.getMonth()+1; refAno=now.getFullYear();
  }
  const mesesDecorridos=Math.max(0,(refAno-iniAno)*12+(refMes-iniMes));
  const labels=[],planMensal=[],planAcum=[],planValorMensal=[],planValorAcum=[];
  const execMensal=[],execAcum=[],execValorMensal=[],execValorAcum=[];
  let acumPlanPct=0,acumPlanValor=0,acumExecPct=0,acumExecValor=0,mesAtualIdx=0;
  for(let m=1;m<=cronograma.length;m++){
    const slot=cronograma[m-1]||{};
    const base0=(iniMes-1)+m;
    const sAno=iniAno+Math.floor(base0/12);
    const sMes=(base0%12)+1;
    labels.push(new Date(sAno,sMes-1,1).toLocaleDateString('pt-BR',{month:'short',year:'2-digit'}));
    const mp=+Number(slot.planejadoPct||0).toFixed(4);
    const mv=+Number(slot.planejadoValor||0).toFixed(2);
    acumPlanPct+=mp; acumPlanValor+=mv;
    planMensal.push(mp); planAcum.push(+Math.min(acumPlanPct,100).toFixed(2));
    planValorMensal.push(mv); planValorAcum.push(+acumPlanValor.toFixed(2));
    if(m<=mesesDecorridos){
      const ep=+Number(slot.realPct||0).toFixed(4);
      const ev=+Number(slot.realValor||0).toFixed(2);
      acumExecPct+=ep; acumExecValor+=ev;
      execMensal.push(ep); execAcum.push(+Math.min(acumExecPct,100).toFixed(2));
      execValorMensal.push(ev); execValorAcum.push(+acumExecValor.toFixed(2));
      mesAtualIdx=m-1;
    } else {
      execMensal.push(null); execAcum.push(null);
      execValorMensal.push(null); execValorAcum.push(null);
    }
  }
  return { labels,planMensal,planAcum,planValorMensal,planValorAcum,
           execMensal,execAcum,execValorMensal,execValorAcum,
           mesesDecorridos,mesAtualIdx };
}

/* ── Curva S por Serviço ──────────────────────────────────────────────────────────
 *
 * buildCurvaServico(
 *   dataInicio,
 *   itemCronograma,
 *   itensExecucao,
 *   totalMeses,
 *   dataEmissaoObra?,
 *   itemCronogramaExecucao?   ← NOVO: item real mês a mês do cronograma de execução
 * )
 *
 * Parâmetros:
 *   dataInicio              — string 'YYYY-MM-DD'
 *   itemCronograma          — item do cronograma previsto (o.cronogramaItens[i])
 *                             { item, descricao, pesoTotal, valorTotal, meses: [{mes,pct,valor}] }
 *   itensExecucao           — o.itens (planilha de medição) — usado como fallback para execução
 *   totalMeses              — número total de meses do cronograma
 *   dataEmissaoObra         — (opcional) { mes, ano } da planilha prevista
 *   itemCronogramaExecucao  — (opcional) item do cronograma real importado (o.cronogramaItensExecucao[i])
 *                             { item, descricao, meses: [{mes,pct,valor}] }
 *
 * Retorna:
 *   {
 *     descricao,
 *     item,
 *     labels[],             — inclui "Mês 0" como primeiro ponto (origem)
 *     planMensal[],         — % previsto por mês (não acumulado); índice 0 = Mês 0 = 0
 *     planAcum[],           — % previsto acumulado; índice 0 = 0
 *     planValorMensal[],    — R$ previsto por mês; índice 0 = 0
 *     planValorAcum[],      — R$ previsto acumulado; índice 0 = 0
 *     execMensal[],         — % real por mês (null para meses futuros); índice 0 = 0
 *     execAcum[],           — % real acumulado (null para meses futuros); índice 0 = 0
 *     execValorMensal[],    — R$ real por mês; índice 0 = 0
 *     execValorAcum[],      — R$ real acumulado; índice 0 = 0
 *     execAcumPct,          — % real acumulado total deste serviço
 *     execAcumValor,        — R$ real acumulado total
 *     valorContrato,
 *     pesoTotal,
 *     status,               — 'em_dia' | 'atrasado' | 'adiantado' | 'nao_iniciado'
 *     mesAtualIdx,          — índice 0-based do mês atual (contando o Mês 0)
 *     mesesDecorridos,
 *   }
 */
export function buildCurvaServico(dataInicio, itemCronograma, itensExecucao, totalMeses, dataEmissaoObra, itemCronogramaExecucao) {
  if (!dataInicio || !itemCronograma) return null;

  const [iniAno, iniMes] = dataInicio.split('-').map(Number);

  // Mês de referência: usa dataEmissaoObra do previsto, depois data atual
  let refAno, refMes;
  if (dataEmissaoObra && dataEmissaoObra.mes && dataEmissaoObra.ano) {
    refMes = dataEmissaoObra.mes;
    refAno = dataEmissaoObra.ano;
  } else {
    const now = new Date();
    refMes = now.getMonth() + 1;
    refAno = now.getFullYear();
  }

  // mesesDecorridos: quantos meses do cronograma já têm dados (inclusive o mês de emissão)
  // Ex: obra inicia jan/25, emissão jan/25 → mesesDecorridos = 1 (o mês 1 tem dados)
  // Ex: obra inicia jan/25, emissão mar/25 → mesesDecorridos = 3
  const mesesDecorridos = Math.max(0, (refAno - iniAno) * 12 + (refMes - iniMes) + 1);

  // Mapeia meses do planejado
  const mesesItem = Array.isArray(itemCronograma.meses) ? itemCronograma.meses : [];
  const planMap   = {};
  mesesItem.forEach(m => { planMap[m.mes] = m; });

  // Mapeia meses do executado real (cronogramaItensExecucao)
  const mesesExec = Array.isArray(itemCronogramaExecucao?.meses) ? itemCronogramaExecucao.meses : [];
  const execMap   = {};
  mesesExec.forEach(m => { execMap[m.mes] = m; });
  const temExecucaoMensal = mesesExec.length > 0;

  // ── Ponto de origem: Mês 0 (todos os valores = 0) ────────────────────────────
  const labels          = ['Mês 0'];
  const planMensal      = [0];
  const planAcum        = [0];
  const planValorMensal = [0];
  const planValorAcum   = [0];
  const execMensal      = [0];
  const execAcum        = [0];
  const execValorMensal = [0];
  const execValorAcum   = [0];

  let acumPlanPct   = 0;
  let acumPlanValor = 0;
  let acumExecPct   = 0;
  let acumExecValor = 0;
  // mesAtualIdx começa em 0 (Mês 0); será atualizado conforme meses decorridos
  let mesAtualIdx   = 0;

  for (let m = 1; m <= totalMeses; m++) {
    // Label do mês (mês calendário)
    const base0 = (iniMes - 1) + m;
    const sAno  = iniAno + Math.floor(base0 / 12);
    const sMes  = (base0 % 12) + 1;
    labels.push(new Date(sAno, sMes - 1, 1).toLocaleDateString('pt-BR', { month:'short', year:'2-digit' }));

    // Planejado
    const planSlot = planMap[m] || { pct: 0, valor: 0 };
    const mp   = +Number(planSlot.pct   || 0).toFixed(4);
    const mv   = +Number(planSlot.valor || 0).toFixed(2);
    acumPlanPct   += mp;
    acumPlanValor += mv;
    planMensal.push(mp);
    planAcum.push(+Math.min(acumPlanPct, 100).toFixed(2));
    planValorMensal.push(mv);
    planValorAcum.push(+acumPlanValor.toFixed(2));

    // Executado real mês a mês
    // m <= mesesDecorridos: inclui o mês de emissão (já tem dados)
    if (temExecucaoMensal) {
      if (m <= mesesDecorridos) {
        const execSlot = execMap[m] || { pct: 0, valor: 0 };
        const ep = +Number(execSlot.pct   || 0).toFixed(4);
        const ev = +Number(execSlot.valor || 0).toFixed(2);
        acumExecPct   += ep;
        acumExecValor += ev;
        execMensal.push(ep);
        execAcum.push(+Math.min(acumExecPct, 100).toFixed(2));
        execValorMensal.push(ev);
        execValorAcum.push(+acumExecValor.toFixed(2));
        // mesAtualIdx aponta para o último mês com dados (índice considera o Mês 0 no início)
        mesAtualIdx = m; // +1 por causa do Mês 0 inserido no início do array
      } else {
        execMensal.push(null);
        execAcum.push(null);
        execValorMensal.push(null);
        execValorAcum.push(null);
      }
    } else {
      execMensal.push(null);
      execAcum.push(null);
      execValorMensal.push(null);
      execValorAcum.push(null);
    }
  }

  // execAcumPct e execAcumValor: prioridade para o último valor acumulado real da série mensal;
  // fallback para o item da planilha de medição
  let execAcumPctFinal   = acumExecPct;
  let execAcumValorFinal = acumExecValor;
  if (!temExecucaoMensal) {
    const execItem = (itensExecucao || []).find(r =>
      String(r.item).trim() === String(itemCronograma.item).trim()
    );
    execAcumPctFinal   = execItem ? +Number(execItem.percentualExecutado || 0).toFixed(2) : 0;
    execAcumValorFinal = execItem ? +Number(execItem.acumulado           || 0).toFixed(2) : 0;
  }

  // valorContrato: 1º cronograma, 2º item medição, 3º último acumulado planejado
  const execItemFallback = (itensExecucao || []).find(r =>
    String(r.item).trim() === String(itemCronograma.item).trim()
  );
  const valorContrato = +Number(
    itemCronograma.valorTotal ||
    execItemFallback?.valorContrato   ||
    planValorAcum[planValorAcum.length - 1] ||
    0
  ).toFixed(2);

  const pesoTotal = +Number(itemCronograma.pesoTotal || 0).toFixed(4);

  // Status baseado na comparação acumulada até o mês atual
  // mesAtualIdx aponta para o Mês 0 (+array) ou último mês com dados
  const planAteAgora = planAcum[mesAtualIdx] || 0;
  let status = 'nao_iniciado';
  if (planAteAgora > 0 || execAcumPctFinal > 0) {
    if (execAcumPctFinal === 0 && planAteAgora > 0) {
      status = 'atrasado';
    } else if (execAcumPctFinal >= planAteAgora - 0.01) {
      status = execAcumPctFinal > planAteAgora + 0.01 ? 'adiantado' : 'em_dia';
    } else {
      status = 'atrasado';
    }
  }

  return {
    descricao:       itemCronograma.descricao || `Serviço ${itemCronograma.item}`,
    item:            itemCronograma.item,
    labels,
    planMensal,
    planAcum,
    planValorMensal,
    planValorAcum,
    execMensal,
    execAcum,
    execValorMensal,
    execValorAcum,
    execAcumPct:   execAcumPctFinal,
    execAcumValor: execAcumValorFinal,
    valorContrato,
    pesoTotal,
    status,
    mesAtualIdx,
    mesesDecorridos
  };
}
