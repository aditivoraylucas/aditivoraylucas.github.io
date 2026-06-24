/**
 * obra-context.js — ponte de injeção de dependência.
 *
 * Quebra TODOS os ciclos entre render-obra.js e render-obras.js.
 *
 * render-obra.js  chama registerObraContext() injetando as suas funções.
 * render-obras.js chama registerObrasContext() injetando renderObrasBox.
 * Qualquer módulo usa as funções daqui sem criar ciclos.
 *
 * REGRA: não adicionar lógica aqui — apenas passagem de ponteiros.
 */

let _applySelected   = () => {};
let _renderAll       = () => {};
let _updateDashboard = () => {};
let _renderObrasBox  = () => {};

/** Chamado por render-obra.js ao ser carregado */
export function registerObraContext(fns) {
  if (fns.applySelected)   _applySelected   = fns.applySelected;
  if (fns.renderAll)       _renderAll       = fns.renderAll;
  if (fns.updateDashboard) _updateDashboard = fns.updateDashboard;
}

/** Chamado por render-obras.js ao ser carregado */
export function registerObrasContext(fns) {
  if (fns.renderObrasBox) _renderObrasBox = fns.renderObrasBox;
}

export function applySelected(o)  { _applySelected(o); }
export function renderAll()       { _renderAll(); }
export function updateDashboard() { _updateDashboard(); }
export function renderObrasBox()  { _renderObrasBox(); }
