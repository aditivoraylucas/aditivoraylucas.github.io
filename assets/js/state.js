export const state = {
  user: null, admin: false, userName: '',
  obras: [], selectedObraId: null, rows: [],
  allUsers: {}, adminSubs: {},
  adminSelectedUid: null, adminSelectedObraId: null,
  unsubUserObras: null, unsubAllUsers: null,
  chartUser: null, chartAdmin: null,
  saveTimer: null, colabFormReady: false
};

export const $        = id => document.getElementById(id);
export const fmtMoney = v  => new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v)||0);
export const esc      = s  => String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
export const parseMoney = s => Number(String(s||'').replace(/[R$\s.]/g,'').replace(',','.')) || 0;
export const norm     = v  => String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim();
export const isNum    = v  => v !== '' && !isNaN(Number(v)) && isFinite(Number(v));
export const baseName = n  => String(n||'').replace(/\.[^.]+$/,'');
export const money    = fmtMoney;
export const pct      = n  => `${Number(n||0).toFixed(2)}%`;

export const EXCEL_EXTS = new Set(['xls','xlsx','xlsm','xlsb','xlam','xla','ods','csv']);

export function currentObra(){ return state.obras.find(o => o.id === state.selectedObraId); }
export function calcPctGeral(resumo, itens){
  const vca = Number(resumo?.valorContratoAditivo) || 0;
  const acu = Number(resumo?.acumuladoTotal) || 0;
  if(vca > 0 && acu > 0) return +(acu/vca*100).toFixed(2);
  const tv = (itens||[]).reduce((a,i)=>a+(Number(i.valorContrato)||0),0);
  const ta = (itens||[]).reduce((a,i)=>a+(Number(i.acumulado)||0),0);
  return tv > 0 ? +(ta/tv*100).toFixed(2) : 0;
}
export function showView(name){
  ['loginView','appView','adminView'].forEach(v => $(v).style.display = 'none');
  $(name).style.display = name === 'loginView' ? 'flex' : 'block';
}
export function showToast(msg, isError=false){
  let t = $('toast');
  if(!t){ t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.className = 'toast'+(isError?' toast-error':''); t.style.opacity = '1';
  clearTimeout(t._timer); t._timer = setTimeout(()=>{ t.style.opacity='0'; }, isError?5000:3500);
}
export function cleanup(adminSubs, allUsers){
  if(state.unsubUserObras) state.unsubUserObras();
  if(state.unsubAllUsers)  state.unsubAllUsers();
  Object.values(adminSubs||state.adminSubs).forEach(fn => fn && fn());
  state.adminSubs = {}; state.allUsers = {};
  state.adminSelectedUid = null; state.adminSelectedObraId = null;
}

/* ── Cronograma Físico-Financeiro ── */
/**
 * Dado dataInicio (string 'YYYY-MM-DD') e o array cronograma da obra,
 * retorna array de { label, planejadoPct, planejadoValor, passado }.
 *
 * REGRA DE LABEL (alinhado ao mês de término):
 *   offset = m → label representa o mês de ENCERRAMENTO do período.
 *   O último label sempre coincide com o mês do Término Previsto.
 *
 *   Exemplo: início 17/03/2025, 18 meses
 *     m=1  → abr/25  |  m=18 → set/26 (= Término 17/09/2026) ✔
 *
 * REGRA "HOJE" (passado):
 *   Como os labels estão deslocados +1 em relação ao período real,
 *   usamos m <= mesesDecorridos (sem +1) para que a linha Hoje
 *   caia no label correto (mês atual).
 *
 *   Exemplo hoje = jun/26, início = mar/25:
 *     mesesDecorridos = (2026-2025)*12 + (6-3) = 15
 *     passado = m <= 15  → último passado é m=15, label = (3-1+15)%12+1 = 18%12+1 = 7 = jun ✔
 */
export function buildCronogramaTimeline(dataInicio, cronograma){
  if(!dataInicio || !Array.isArray(cronograma) || !cronograma.length) return [];

  const [iniAno, iniMes] = dataInicio.split('-').map(Number);

  const now     = new Date();
  const hojeAno = now.getFullYear();
  const hojeMes = now.getMonth() + 1;

  const mesesDecorridos = Math.max(0,
    (hojeAno - iniAno) * 12 + (hojeMes - iniMes)
  );

  const totalMeses = cronograma.length;
  const result = [];

  for(let m = 1; m <= totalMeses; m++){
    // offset = m: label = mês de encerramento do período m
    const totalMesBase0 = (iniMes - 1) + m;
    const slotAno  = iniAno + Math.floor(totalMesBase0 / 12);
    const slotMes  = (totalMesBase0 % 12) + 1;
    const slotDate = new Date(slotAno, slotMes - 1, 1);
    const label    = slotDate.toLocaleDateString('pt-BR', { month:'short', year:'2-digit' });

    const entry = cronograma[m - 1];
    result.push({
      mes: m,
      label,
      planejadoPct:   entry ? +Number(entry.planejadoPct).toFixed(2)   : 0,
      planejadoValor: entry ? +Number(entry.planejadoValor).toFixed(2) : 0,
      // sem +1: compensa o deslocamento de label para que "Hoje" caia no mês correto
      passado: m <= mesesDecorridos
    });
  }
  return result;
}
