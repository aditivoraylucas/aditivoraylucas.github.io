import { auth, db } from './firebase.js';
import { state, showView, showToast, cleanup } from './state.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { collection, query, where, onSnapshot, doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { renderAll, applySelected } from './render-obra.js';
import { renderAdminViews } from './render-admin.js';
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
          const obrasQ = collection(db, 'users', uid, 'obras');
          state.adminSubs[uid] = onSnapshot(obrasQ, obrasSnap => {
            const obras = obrasSnap.docs
              .map(d => ({ id: d.id, ...d.data() }))
              .filter(o => !o.deletedAt);
            state.allUsers[uid] = { ...data, obras };
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

  showView('appView');
  const obrasQ = collection(db, 'users', user.uid, 'obras');
  state.unsubUserObras = onSnapshot(obrasQ, snap => {
    state.obras = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(o => !o.deletedAt);

    const obraIdDaUrl   = getObraIdDaUrl();
    const obraRestaurada = obraIdDaUrl ? state.obras.find(o => o.id === obraIdDaUrl) : null;

    if (obraRestaurada) {
      state.selectedObraId = obraRestaurada.id;
    } else if (!state.selectedObraId || !state.obras.find(o => o.id === state.selectedObraId)) {
      state.selectedObraId = state.obras[0]?.id ?? null;
    }

    if (state.selectedObraId) {
      const obra = state.obras.find(o => o.id === state.selectedObraId);
      if (obra) applySelected(obra);
    } else {
      setObraIdNaUrl(null);
    }

    renderAll();
  });
});
