// P-006 — estado em URL: obra ativa, item selecionado, etc.
// F5 mantém estado. Não altera history stack desnecessariamente.

export function getParam(chave, padrao = '') {
  return new URLSearchParams(location.search).get(chave) ?? padrao;
}

export function setParam(chave, valor) {
  const params = new URLSearchParams(location.search);
  if (valor == null || valor === '') {
    params.delete(chave);
  } else {
    params.set(chave, valor);
  }
  const novaQuery = params.toString();
  const novaUrl   = novaQuery ? `${location.pathname}?${novaQuery}` : location.pathname;
  history.replaceState(null, '', novaUrl);
}

export function getObraIdDaUrl() {
  return getParam('obra') || null;
}

export function setObraIdNaUrl(obraId) {
  setParam('obra', obraId);
}

export function limparObraIdDaUrl() {
  setParam('obra', null);
}
