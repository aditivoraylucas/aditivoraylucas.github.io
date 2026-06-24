import { $, showToast, cleanup } from './state.js';
import { auth, db } from './firebase.js';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { doc, setDoc, updateDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';

/**
 * auth-events.js — autenticação e gestão de colaboradores.
 * Extraído de events.js na Fase 2 da refatoração incremental.
 * Responsável por: login, logout, cadastro de colaborador,
 *   bloqueio/desbloqueio, remoção de colaborador.
 */

/** Cadastro de novo colaborador via Firebase Auth + Firestore */
export function setupColabForm() {
  const form = $('addColabForm');
  if (!form) return;
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const nome  = $('colabNome').value.trim();
    const email = $('colabEmail').value.trim();
    const senha = $('colabSenha').value;
    const errBox = $('colabMsgError');
    errBox.style.display = 'none';
    const btn = $('addColabBtn');
    btn.disabled = true;
    btn.textContent = 'Aguarde...';
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, senha);
      await setDoc(doc(db, 'users', cred.user.uid), {
        nome, email, role: 'colaborador', blocked: false,
        createdAt: new Date().toISOString()
      });
      showToast('\u2705 Colaborador cadastrado!');
      form.reset();
    } catch (err) {
      errBox.textContent = err.message;
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Cadastrar colaborador';
    }
  });
}

/** Bind do formulário de login */
export function setupLoginForm() {
  const loginForm = $('loginForm');
  if (!loginForm) return;
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('loginBtn');
    btn.disabled = true;
    btn.textContent = 'Entrando...';
    const errBox = $('loginError');
    errBox.style.display = 'none';
    try {
      await signInWithEmailAndPassword(
        auth,
        $('loginEmail').value.trim(),
        $('loginSenha').value
      );
    } catch (err) {
      errBox.textContent = 'E-mail ou senha incorretos.';
      errBox.style.display = 'block';
    } finally {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
}

/** Bind dos botões de logout (usuário e admin) */
export function setupLogout() {
  const logoutUser  = $('logoutBtnUser');
  const logoutAdmin = $('logoutBtnAdmin');
  if (logoutUser)  logoutUser.onclick  = async () => { await signOut(auth); cleanup(); };
  if (logoutAdmin) logoutAdmin.onclick = async () => { await signOut(auth); cleanup(); };
}

/** Bloquear / desbloquear colaborador (exposto no window via events.js) */
export async function toggleBloqueio(uid, bloqueado) {
  try {
    await updateDoc(doc(db, 'users', uid), { blocked: !bloqueado });
    showToast(bloqueado ? '\u2705 Colaborador desbloqueado.' : '\u{1F512} Colaborador bloqueado.');
  } catch (err) {
    showToast('\u274C ' + err.message, true);
  }
}

/** Remover (desabilitar) colaborador (exposto no window via events.js) */
export async function removeColab(uid) {
  if (!confirm('Remover este colaborador permanentemente?')) return;
  try {
    await updateDoc(doc(db, 'users', uid), { disabled: true });
    showToast('\u2705 Colaborador removido.');
  } catch (err) {
    showToast('\u274C ' + err.message, true);
  }
}
