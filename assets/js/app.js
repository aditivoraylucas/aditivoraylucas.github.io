import { auth, db } from './firebase.js';
import { state, showView, showToast, cleanup } from './state.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, query, where, onSnapshot, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { renderAll, renderAdminViews, applySelected } from './render.js';
import { bindEvents, setupNovaAtividade, setupColabForm } from './events.js';
import { getObraIdDaUrl, setObraIdNaUrl } from './url-state.js';

bindEvents();
setupNovaAtividade();

onAuthStateChanged(auth, async user => {
  if (!user) {
    cleanup();
    showView('loginView');
    return;
  }

  state.user = user;
  const userSnap = await getDoc(doc(db, 'users', user.uid));
  const userData = userSnap.exists() ? userSnap.data() : {};
  state.admin    = userData.role === 'admin';
  state.userName = userData.nome || user.email || '';

  const nameEl = document.getElementById('userNameDisplay');
  if (nameEl) nameEl.textContent = state.userName;

  if (state.admin) {
    showView('adminView');
    setupColabForm();

    const usersQ = query(collection(db, 'users'), where('role', '!=', 'admin'));
    state.unsubAllUsers = onSnapshot(usersQ, async snap => {
      const updates = snap.docChanges();
      for (const change of updates) {
        const uid  = change.doc.id;
        const data = change.doc.data();
        if (change.type === 'removed' || data.disabled) {
          delete state.allUsers[uid];
          if (state.adminSubs[uid]) { state.adminSubs[uid](); delete state.adminSubs[uid]; }
          continue;
        }
        if (!state.adminSubs[uid]) {
          // P-007: filtra obras com deletedAt no listener do admin
          const obrasQ = query(
            collection(db, 'users', uid, 'obras'),
            where('deletedAt', '==', null)
          );
          state.adminSubs[uid] = onSnapshot(obrasQ, obrasSnap => {
            state.allUsers[uid] = { ...data, obras: obrasSnap.docs.map(d => ({ id: d.id, ...d.data() })) };
            renderAdminViews();
          });
        } else {
          state.allUsers[uid] = { ...data, obras: state.allUsers[uid]?.obras || [] };
        }
      }
      renderAdminViews();
    });
    return;
  }

  // Colaborador: escuta obras sem deletedAt
  // P-007: where('deletedAt', '==', null) filtra documentos com soft delete
  // Obras removidas ficam no Firestore mas nunca aparecem na UI
  showView('appView');
  const obrasQ = query(
    collection(db, 'users', user.uid, 'obras'),
    where('deletedAt', '==', null)
  );
  state.unsubUserObras = onSnapshot(obrasQ, snap => {
    state.obras = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // P-006: tenta restaurar obra ativa da URL; senão usa a primeira
    const obraIdDaUrl = getObraIdDaUrl();
    const obraRestaurada = obraIdDaUrl
      ? state.obras.find(o => o.id === obraIdDaUrl)
      : null;

    if (obraRestaurada) {
      state.selectedObraId = obraRestaurada.id;
    } else if (!state.selectedObraId || !state.obras.find(o => o.id === state.selectedObraId)) {
      state.selectedObraId = state.obras[0]?.id ?? null;
    }

    if (state.selectedObraId) {
      const obra = state.obras.find(o => o.id === state.selectedObraId);
      if (obra) {
        applySelected(obra); // também grava o ID na URL
      }
    } else {
      setObraIdNaUrl(null);
    }

    renderAll();
  });
});
