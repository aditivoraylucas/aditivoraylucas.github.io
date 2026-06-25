import { db } from './firebase.js';
import { state, esc } from './state.js';
import {
  collection, query, orderBy, limit, getDocs
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/**
 * render-auditoria.js — carrega e renderiza os últimos N eventos de auditoria
 * no painel administrativo. Append-only, somente leitura para esta view.
 */

const POR_PAGINA  = 30;
const ACOES_LABEL = {
  OBRA_CRIADA:         { icon: '\u{1F195}', label: 'Obra criada',              cor: '#10b981' },
  OBRA_REMOVIDA:       { icon: '\u{1F5D1}', label: 'Obra removida',            cor: '#ef4444' },
  ITEM_ADICIONADO:     { icon: '\u2795',    label: 'Item adicionado',          cor: '#6366f1' },
  ITEM_REMOVIDO:       { icon: '\u2796',    label: 'Item removido',            cor: '#f59e0b' },
  COLAB_CRIADO:        { icon: '\u{1F464}', label: 'Colaborador criado',       cor: '#10b981' },
  COLAB_BLOQUEADO:     { icon: '\u{1F512}', label: 'Colaborador bloqueado',    cor: '#ef4444' },
  COLAB_DESBLOQUEADO:  { icon: '\u2705',    label: 'Colaborador desbloqueado', cor: '#10b981' },
  COLAB_REMOVIDO:      { icon: '\u{1F6AB}', label: 'Colaborador removido',     cor: '#ef4444' },
};

function nomeColaborador(uid) {
  if (!uid) return '\u2014';
  if (uid === state.user?.uid) return '\u{1F451} Você (admin)';
  const u = state.allUsers?.[uid];
  if (u?.nome) return esc(u.nome);
  return uid.slice(0, 8) + '\u2026';
}

function formatarData(ts) {
  if (!ts) return '\u2014';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  if (isNaN(d)) return '\u2014';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function snapshotHTML(snap) {
  if (!snap || typeof snap !== 'object') return '';
  const pares = Object.entries(snap)
    .filter(([, v]) => v !== null && v !== undefined)
    .map(([k, v]) => `<span style="color:var(--text-muted)">${esc(k)}:</span> <strong>${esc(String(v))}</strong>`);
  if (!pares.length) return '';
  return `<div style="font-size:.72rem;margin-top:.25rem;color:var(--text-muted)">${pares.join(' \u00b7 ')}</div>`;
}

export async function renderPainelAuditoria(containerId) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = '<p style="color:var(--text-muted);font-size:.8rem">\u23F3 Carregando...</p>';
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
      const cfg = ACOES_LABEL[ev.acao] || { icon: '\u{1F4DD}', label: ev.acao || 'Evento', cor: '#64748b' };
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
    box.innerHTML = `<p style="color:var(--danger);font-size:.8rem">\u274C Erro ao carregar: ${esc(err.message)}</p>`;
    console.error('[Auditoria]', err);
  }
}
