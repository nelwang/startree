import { computed, onUnmounted, ref } from 'vue';

export type ThemePreference = 'system' | 'light' | 'dark';
const storageKey = 'startree-theme';
const paletteKey = 'startree-palette';
const normalizePalette = (value: unknown) =>
  value === 'ocean' || value === 'dune' || value === 'dusk' ? value : 'forest';
const normalize = (value: unknown): ThemePreference =>
  value === 'light' || value === 'dark' ? value : 'system';

export function useTheme() {
  const preference = ref(normalize(document.documentElement.dataset.theme));
  const palette = ref(normalizePalette(document.documentElement.dataset.palette));
  const system = window.matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    document.documentElement.dataset.theme = preference.value;
    document.documentElement.dataset.palette = palette.value;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', getComputedStyle(document.documentElement).backgroundColor);
  };
  const selection = computed(() => `${palette.value}:${preference.value}`);
  const setTheme = (value: string) => {
    const [nextPalette, nextPreference] = value.split(':');
    palette.value = normalizePalette(nextPalette);
    preference.value = normalize(nextPreference);
    apply();
    try {
      localStorage.setItem(paletteKey, palette.value);
      localStorage.setItem(storageKey, preference.value);
    } catch {
      // Keep the current session usable when browser storage is unavailable.
    }
  };
  const sync = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return;
    if (event.key === storageKey || event.key === null)
      preference.value = normalize(event.newValue);
    if (event.key === paletteKey || event.key === null)
      palette.value = normalizePalette(event.newValue);
    apply();
  };
  system.addEventListener('change', apply);
  window.addEventListener('storage', sync);
  onUnmounted(() => {
    system.removeEventListener('change', apply);
    window.removeEventListener('storage', sync);
  });
  apply();
  return { selection, setTheme };
}
