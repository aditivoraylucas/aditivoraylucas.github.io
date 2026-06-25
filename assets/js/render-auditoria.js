import { db } from './firebase.js';
import { state, esc } from './state.js';
import {
  collection, query, orderBy, limit, startAfter, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/**
 * render-auditoria.js — log com filtro por tipo, filtro por colaborador e paginação.
 */

const POR_PAGINA = 30;

export const ACOES_LABEL = {
  OBRA_CRIADA:          { icon: '🆕', label: 'Obra criada',              cor: '#10b981' },
  OBRA_ATUALIZADA:      { icon: '🔄', label: 'Obra atualizada',           cor: '#3b82f6' },
  OBRA_REMOVIDA:        { icon: '🗑', label: 'Obra removida',            cor: '#ef4444' },
  CRONOGRAMA_PREVISTO:  { icon: '📅', label: 'Cronograma previsto',       cor: '#8b5cf6' },
  CRONOGRAMA_EXECUCAO:  { icon: '📊', label: 'Cronograma de execução',   cor: '#0ea5e9' },
  ITEM_ADICIONADO:      { icon: '➕', label: 'Item adicionado',          cor: '#6366f1' },
  ITEM_REMOVIDO:        { icon: '➖', label: 'Item removido',            cor: '#f59e0b' },
  COLAB_CRIADO:         { icon: '👤', label: 'Colaborador criado',       cor: '#10b981' },
  COLAB_BLOQUEADO:      { icon: '🔒', label: 'Colaborador bloqueado',    cor: '#ef4444' },
  COLAB_DESBLOQUEADO:   { icon: '✅', label: 'Colaborador desbloqueado', cor: '#10b981' },
  COLAB_REMOVIDO:       { icon: '🚫', label: 'Colaborador removido',     cor: '#ef4444' },
};

const CAMPOS_PERMITIDOS = [
  'nome', 'nomeProjeto', 'name', 'contratada', 'email',
  'medicaoAtual', 'dataInicio', 'dataEmissao', 'arquivoNome',
  'totalMeses', 'item', 'descricao', 'valorContrato', 'acumulado', 'pct',
];

// Estado interno da paginação e filtros
const _st = {
  cursor:      null,   // último doc do Firestore para startAfter
  fim:         false,  // true quando não há mais páginas
  todos:       [],     // todos os eventos carregados até agora
  filtroAcao:  '',     // acao selecionada ou ''
  filtroUid:   '',     // uid selecionado ou ''
  containerId: '',
};

function nomeColaborador(uid) {
  if (!uid) return '—';
  if (uid === state.user?.uid) return '👑 Você (admin)';
  const u = state.allUsers?.[uid];
  if (u?.nome) return esc(u.nome);
  return uid.slice(0, 8) + '…';
}

function formatarData(ts) {
  if (!ts) return '—';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function snapshotHTML(snap) {
  if (!snap || typeof snap !== 'object') return '';
  const pares = CAMPOS_PERMITIDOS
    .filter(k => snap[k] !== undefined && snap[k] !== null && typeof snap[k] !== 'object')
    .map(k => `<span style="color:var(--text-muted)">${esc(k)}:</span> <strong>${esc(String(snap[k]))}</strong>`);
  if (!pares.length) return '';
  return `<div style="font-size:.72rem;margin-top:.25rem;color:var(--text-muted);line-height:1.6">${pares.join(' · ')}</div>`;
}

// ── Filtros ─────────────────────────────────────────────────────────────────

function buildFiltros(box) {
  // Monta opções de tipo
  const tipoOpts = Object.entries(ACOES_LABEL)
    .map(([k, v]) => `<option value="${k}">${v.icon} ${v.label}</option>`)
    .join('');

  // Monta opções de colaborador (usa state.allUsers + admin)
  const colabOpts = Object.entries(state.allUsers || {})
    .map(([uid, u]) => `<option value="${uid}">${esc(u.nome || uid)}</option>`)
    .join('');
  const adminOpt = state.user?.uid
    ? `<option value="${state.user.uid}">👑 Você (admin)</option>`
    : '';

  const html = `
    <div class="auditoria-filtros">
      <select id="auditFiltroTipo" style="font-size:.78rem;padding:.25rem .5rem;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">
        <option value="">Todos os tipos</option>
        ${tipoOpts}
      </select>
      <select id="auditFiltroColab" style="font-size:.78rem;padding:.25rem .5rem;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">
        <option value="">Todos os usuários</option>
        ${adminOpt}
        ${colabOpts}
      </select>
      <span id="auditContador" style="font-size:.72rem;color:var(--text-muted);margin-left:auto"></span>
    </div>
    <div id="auditLista"></div>
    <div id="auditPagBtn" style="text-align:center;margin-top:.75rem"></div>
  `;
  box.innerHTML = html;

  document.getElementById('auditFiltroTipo').addEventListener('change', e => {
    _st.filtroAcao = e.target.value;
    _renderFiltrado();
  });
  document.getElementById('auditFiltroColab').addEventListener('change', e => {
    _st.filtroUid = e.target.value;
    _renderFiltrado();
  });
}

// ── Renderização dos eventos (com filtro aplicado) ─────────────────────────

function _renderFiltrado() {
  const lista    = document.getElementById('auditLista');
  const pagBtn   = document.getElementById('auditPagBtn');
  const contador = document.getElementById('auditContador');
  if (!lista) return;

  const filtrados = _st.todos.filter(ev => {
    if (_st.filtroAcao && ev.acao !== _st.filtroAcao) return false;
    if (_st.filtroUid  && ev.uid  !== _st.filtroUid)  return false;
    return true;
  });

  if (contador) contador.textContent = `${filtrados.length} evento${filtrados.length !== 1 ? 's' : ''}`;

  if (!filtrados.length) {
    lista.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem;padding:.5rem 0">Nenhum evento encontrado.</p>';
  } else {
    lista.innerHTML = filtrados.map(ev => {
      const cfg = ACOES_LABEL[ev.acao] || { icon: '📝', label: ev.acao || 'Evento', cor: '#64748b' };
      return `
      <div class="auditoria-row">
        <span class="auditoria-badge" style="--badge-cor:${cfg.cor}">${cfg.icon} ${cfg.label}</span>
        <div class="auditoria-info">
          <span class="auditoria-who">${nomeColaborador(ev.uid)}</span>
          ${snapshotHTML(ev.snapshotAntes)}
        </div>
        <time class="auditoria-time">${formatarData(ev.criadoEm)}</time>
      </div>`;
    }).join('');
  }

  // Botão "Carregar mais"
  if (pagBtn) {
    if (!_st.fim) {
      pagBtn.innerHTML = `<button id="btnCarregarMais" style="font-size:.78rem;padding:.35rem .9rem;border-radius:6px;border:1px solid var(--border);background:var(--surface);color:var(--text);cursor:pointer">⇩ Carregar mais</button>`;
      document.getElementById('btnCarregarMais').addEventListener('click', () => _carregarMais());
    } else {
      pagBtn.innerHTML = filtrados.length
        ? `<span style="font-size:.72rem;color:var(--text-muted)">Todos os eventos carregados (${_st.todos.length} total)</span>`
        : '';
    }
  }
}

// ── Busca no Firestore ───────────────────────────────────────────────────────

async function _carregarMais() {
  const btn = document.getElementById('btnCarregarMais');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Carregando...'; }

  try {
    const constraints = [
      collection(db, 'auditoria_eventos'),
      orderBy('criadoEm', 'desc'),
      limit(POR_PAGINA),
    ];
    if (_st.cursor) constraints.push(startAfter(_st.cursor));

    const snap = await getDocs(query(...constraints));

    if (snap.empty || snap.docs.length < POR_PAGINA) _st.fim = true;
    if (!snap.empty) {
      _st.cursor = snap.docs[snap.docs.length - 1];
      _st.todos.push(...snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }
  } catch (err) {
    console.error('[Auditoria]', err);
  }

  _renderFiltrado();
}

// ── Ponto de entrada público ─────────────────────────────────────────────────

export async function renderPainelAuditoria(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;

  // Reset ao reabrir o painel
  _st.cursor      = null;
  _st.fim         = false;
  _st.todos       = [];
  _st.filtroAcao  = '';
  _st.filtroUid   = '';
  _st.containerId = containerId;

  box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">⏳ Carregando...</p>';

  try {
    const snap = await getDocs(query(
      collection(db, 'auditoria_eventos'),
      orderBy('criadoEm', 'desc'),
      limit(POR_PAGINA)
    ));

    if (snap.empty) {
      box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhum evento registrado.</p>';
      return;
    }

    if (snap.docs.length < POR_PAGINA) _st.fim = true;
    _st.cursor = snap.docs[snap.docs.length - 1];
    _st.todos  = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    buildFiltros(box);
    _renderFiltrado();

  } catch (err) {
    box.innerHTML = `<p style="color:var(--danger);font-size:.8rem">❌ Erro ao carregar: ${esc(err.message)}</p>`;
    console.error('[Auditoria]', err);
  }
}
