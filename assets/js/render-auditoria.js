import { db } from './firebase.js';
import { state, esc } from './state.js';
import {
  collection, query, orderBy, limit, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/**
 * render-auditoria.js — carrega e renderiza os últimos N eventos de auditoria
 * no painel administrativo.
 */

const POR_PAGINA = 30;

const ACOES_LABEL = {
  OBRA_CRIADA:         { icon: '🆕', label: 'Obra criada',              cor: '#10b981' },
  OBRA_REMOVIDA:       { icon: '🗑', label: 'Obra removida',            cor: '#ef4444' },
  ITEM_ADICIONADO:     { icon: '➕', label: 'Item adicionado',          cor: '#6366f1' },
  ITEM_REMOVIDO:       { icon: '➖', label: 'Item removido',            cor: '#f59e0b' },
  COLAB_CRIADO:        { icon: '👤', label: 'Colaborador criado',       cor: '#10b981' },
  COLAB_BLOQUEADO:     { icon: '🔒', label: 'Colaborador bloqueado',    cor: '#ef4444' },
  COLAB_DESBLOQUEADO:  { icon: '✅', label: 'Colaborador desbloqueado', cor: '#10b981' },
  COLAB_REMOVIDO:      { icon: '🚫', label: 'Colaborador removido',     cor: '#ef4444' },
};

// Apenas campos simples (string/número/boolean) são exibidos
const CAMPOS_PERMITIDOS = [
  'nome', 'nomeProjeto', 'name', 'contratada', 'email',
  'medicaoAtual', 'dataInicio', 'dataEmissao', 'arquivoNome',
  'item', 'descricao', 'valorContrato', 'acumulado', 'pct',
];

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

  // Filtra apenas campos da lista com valores primitivos (sem arrays/objetos)
  const pares = CAMPOS_PERMITIDOS
    .filter(k => snap[k] !== undefined && snap[k] !== null && typeof snap[k] !== 'object')
    .map(k => `<span style="color:var(--text-muted)">${esc(k)}:</span> <strong>${esc(String(snap[k]))}</strong>`);

  if (!pares.length) return '';
  return `<div style="font-size:.72rem;margin-top:.25rem;color:var(--text-muted);line-height:1.6">${pares.join(' · ')}</div>`;
}

export async function renderPainelAuditoria(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">⏳ Carregando...</p>';
  try {
    const q = query(
      collection(db, 'auditoria_eventos'),
      orderBy('criadoEm', 'desc'),
      limit(POR_PAGINA)
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">Nenhum evento registrado.</p>';
      return;
    }
    const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    box.innerHTML = rows.map(ev => {
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
  } catch (err) {
    box.innerHTML = `<p style="color:var(--danger);font-size:.8rem">❌ Erro ao carregar: ${esc(err.message)}</p>`;
    console.error('[Auditoria]', err);
  }
}
