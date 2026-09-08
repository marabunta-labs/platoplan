/**
 * PlatoPlan - ThemeContext
 *
 * Holds the active colour mode (light / dark), persists the choice to
 * AsyncStorage and exposes the resolved palette. Defaults to the OS colour
 * scheme on first launch.
 */

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { colorsFor, type ThemeColors, type ThemeMode } from '../constants/theme';

const THEME_STORAGE_KEY = '@platoplan/theme';

interface ThemeContextValue {
  mode: ThemeMode;
  colors: ThemeColors;
  isDark: boolean;
  setMode: (mode: ThemeMode) => void;
  toggleMode: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>(systemScheme === 'dark' ? 'dark' : 'light');
  const [hasStored, setHasStored] = useState(false);

  // Load the persisted choice on mount (overrides the OS default).
  useEffect(() => {
    AsyncStorage.getItem(THEME_STORAGE_KEY).then((stored) => {
      if (stored === 'light' || stored === 'dark') {
        setModeState(stored);
        setHasStored(true);
      }
    });
  }, []);

  // Follow the OS scheme until the user makes an explicit choice.
  useEffect(() => {
    if (!hasStored && (systemScheme === 'light' || systemScheme === 'dark')) {
      setModeState(systemScheme);
    }
  }, [systemScheme, hasStored]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    setHasStored(true);
    AsyncStorage.setItem(THEME_STORAGE_KEY, next);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      setHasStored(true);
      AsyncStorage.setItem(THEME_STORAGE_KEY, next);
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, colors: colorsFor(mode), isDark: mode === 'dark', setMode, toggleMode }),
    [mode, setMode, toggleMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return ctx;
}
