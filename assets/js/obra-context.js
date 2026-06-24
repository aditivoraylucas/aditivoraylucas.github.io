/**
 * obra-context.js — ponte de injeção de dependência para quebrar o ciclo:
 *   render-obra.js  →  render-obras.js  →  render-obra.js
 *
 * render-obras.js importa daqui (não de render-obra.js).
 * render-obra.js chama registerObraContext() ao inicializar, injetando
 * as funções concretas. Qualquer módulo que precise de applySelected,
 * renderAll ou updateDashboard sem poder importar render-obra.js
 * diretamente deve usar este arquivo.
 *
 * NÃO adicionar lógica aqui — apenas passagem de ponteiros.
 */

let _applySelected  = () => {};
let _renderAll      = () => {};
let _updateDashboard = () => {};

export function registerObraContext(fns) {
  if (fns.applySelected)   _applySelected   = fns.applySelected;
  if (fns.renderAll)       _renderAll       = fns.renderAll;
  if (fns.updateDashboard) _updateDashboard = fns.updateDashboard;
}

export function applySelected(o)  { _applySelected(o); }
export function renderAll()       { _renderAll(); }
export function updateDashboard() { _updateDashboard(); }
