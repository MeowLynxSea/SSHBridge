import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'dark' | 'light' | 'auto';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  effectiveTheme: 'dark' | 'light';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('auto');
  const [effectiveTheme, setEffectiveTheme] = useState<'dark' | 'light'>('dark');

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem('sshbridge-theme', newTheme);

    // Apply theme immediately
    applyTheme(newTheme);
  };

  const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    const isDark =
      theme === 'dark' ||
      (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);

    if (isDark) {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }

    setEffectiveTheme(isDark ? 'dark' : 'light');
  };

  // Check system theme preference
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    const handleChange = () => {
      if (theme === 'auto') {
        applyTheme(theme);
      }
    };

    mediaQuery.addEventListener('change', handleChange);

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [theme]);

  // Initialize theme from localStorage or default
  useEffect(() => {
    const savedTheme = localStorage.getItem('sshbridge-theme') as Theme;
    const initialTheme =
      savedTheme && ['dark', 'light', 'auto'].includes(savedTheme) ? savedTheme : 'auto';

    // Use setTimeout to avoid setting state synchronously during render
    const timer = setTimeout(() => {
      setThemeState(initialTheme);
    }, 0);

    return () => clearTimeout(timer);
  }, []);

  // Apply theme when theme state changes
  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        effectiveTheme,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
