// P-007 — log append-only de eventos importantes.
// NUNCA atualizar ou apagar documentos desta coleção.
// Escrita direta do client é permitida pois não há Cloud Functions ainda;
// quando CF forem adicionadas, mover para lá e bloquear via Security Rules.

import { db } from './firebase.js';
import { collection, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/**
 * @param {object} evento
 * @param {string} evento.uid           - UID do usuário que executou a ação
 * @param {string} evento.entidade      - ex: 'obras', 'itens'
 * @param {string} evento.docId         - ID do documento afetado
 * @param {string} evento.acao          - ex: 'OBRA_REMOVIDA', 'ITEM_REMOVIDO', 'OBRA_CRIADA'
 * @param {object} [evento.snapshotAntes] - estado antes da ação
 */
export async function registrarEvento({ uid, entidade, docId, acao, snapshotAntes = null }) {
  await addDoc(collection(db, 'auditoria_eventos'), {
    uid,
    entidade,
    docId,
    acao,
    snapshotAntes,
    criadoEm: serverTimestamp(),
  });
}
