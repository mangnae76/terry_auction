import { computed, ref, watch } from 'vue';

export type ThemeMode = 'light' | 'dark';

const THEME_STORAGE_KEY = 'auction-theme-mode';

const getInitialTheme = (): ThemeMode => {
  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') {
    return saved;
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const useTheme = () => {
  const theme = ref<ThemeMode>(getInitialTheme());

  const applyTheme = (mode: ThemeMode) => {
    document.documentElement.dataset.theme = mode;
  };

  applyTheme(theme.value);

  watch(theme, (value) => {
    applyTheme(value);
    localStorage.setItem(THEME_STORAGE_KEY, value);
  });

  const toggleTheme = () => {
    theme.value = theme.value === 'light' ? 'dark' : 'light';
  };

  const isDark = computed(() => theme.value === 'dark');

  return {
    theme,
    isDark,
    toggleTheme,
  };
};
