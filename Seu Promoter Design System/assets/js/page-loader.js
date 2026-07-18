// Loader de transição entre páginas.
// Some assim que o conteúdo principal estiver pronto (chamando window.hidePageLoader()),
// ou automaticamente após 'load'/timeout — nunca deixa a página presa atrás do overlay.
(function () {
  const overlay = document.querySelector('.page-loader');
  if (!overlay) return;

  let hidden = false;
  function hide() {
    if (hidden) return;
    hidden = true;
    overlay.classList.add('is-hidden');
    setTimeout(() => overlay.remove(), 500);
  }

  window.hidePageLoader = hide;

  // Redes de segurança: garantem que o loader nunca fique preso.
  window.addEventListener('load', hide);
  setTimeout(hide, 4000);

  // Páginas sem carregamento de dados próprio liberam assim que o HTML terminar de parsear.
  if (document.body.dataset.loaderManual !== 'true') {
    document.addEventListener('DOMContentLoaded', hide);
  }
})();
