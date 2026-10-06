// Run before styles and the application so a saved theme applies on the first paint.
(() => {
  let preference = 'system';
  let palette = 'forest';
  try {
    const savedPalette = localStorage.getItem('startree-palette');
    if (['ocean', 'dune', 'dusk'].includes(savedPalette)) palette = savedPalette;
    const saved = localStorage.getItem('startree-theme');
    if (saved === 'light' || saved === 'dark') preference = saved;
  } catch {
    // Storage can be unavailable; system appearance still works.
  }
  document.documentElement.dataset.theme = preference;
  document.documentElement.dataset.palette = palette;
})();
