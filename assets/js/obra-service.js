import { state } from './state.js';
import { db } from './firebase.js';
import { registrarEvento } from './auditoria.js';
import { doc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/**
 * obra-service.js — persistência e acesso à obra no Firestore.
 * Extraído de render.js na Fase 1 da refatoração incremental.
 * Consumidores: render.js (re-export), events.js, events-import.js
 */

export async function saveObra(obra) {
  if (!state.user?.uid) return;
  await setDoc(doc(db, 'users', state.user.uid, 'obras', obra.id), obra);
}

export async function deleteObra(id) {
  if (!state.user?.uid) return;
  const obraRef = doc(db, 'users', state.user.uid, 'obras', id);
  const snapshot = state.obras.find(o => o.id === id) ?? null;
  await updateDoc(obraRef, { deletedAt: serverTimestamp() });
  await registrarEvento({
    uid: state.user.uid,
    entidade: 'obras',
    docId: id,
    acao: 'OBRA_REMOVIDA',
    snapshotAntes: snapshot
  });
}

export function scheduleSave() {
  clearTimeout(state.saveTimer);
  state.saveTimer = setTimeout(async () => {
    const o = currentObra();
    if (o) { o.itens = state.rows; await saveObra(o); }
  }, 1200);
}

export function currentObra() {
  return state.obras.find(o => o.id === state.selectedObraId);
}
