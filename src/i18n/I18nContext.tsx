/**
 * PlatoPlan - I18n Context
 *
 * Provides locale state and a translation function `t()` to the app.
 * Supports dot-notation keys, simple interpolation {param}, and
 * basic plural syntax {count, plural, one {X} other {Y}}.
 *
 * Persists locale choice to AsyncStorage.
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { es } from './translations/es';
import { en } from './translations/en';

// ─── Types ──────────────────────────────────────────────────────────────────

export type Locale = 'es' | 'en';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LOCALE_STORAGE_KEY = '@platoplan/locale';
const DEFAULT_LOCALE: Locale = 'es';

const translations: Record<Locale, typeof es> = { es, en };

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Resolves a dot-notation key to a value in a nested object.
 * e.g. getNestedValue(obj, 'recipes.title') → obj.recipes.title
 */
function getNestedValue(obj: Record<string, unknown>, path: string): string | undefined {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' ? current : undefined;
}

/**
 * Processes simple plural syntax: {count, plural, one {X} other {Y}}
 * Picks the branch based on the numeric value of 'count' param.
 */
function processPlurals(text: string, params: Record<string, string | number>): string {
  return text.replace(
    /\{(\w+),\s*plural,\s*one\s*\{([^}]*)\}\s*other\s*\{([^}]*)\}\}/g,
    (_match, paramName, oneForm, otherForm) => {
      const value = params[paramName];
      const num = typeof value === 'number' ? value : Number(value);
      return num === 1 ? oneForm : otherForm;
    }
  );
}

/**
 * Processes simple interpolation: {paramName} → params.paramName
 */
function processInterpolation(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_match, paramName) => {
    const value = params[paramName];
    return value !== undefined ? String(value) : `{${paramName}}`;
  });
}

// ─── Context ────────────────────────────────────────────────────────────────

const I18nContext = createContext<I18nContextValue | null>(null);

// ─── Provider ───────────────────────────────────────────────────────────────

interface I18nProviderProps {
  children: React.ReactNode;
}

export function I18nProvider({ children }: I18nProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(DEFAULT_LOCALE);

  // Load persisted locale on mount
  useEffect(() => {
    AsyncStorage.getItem(LOCALE_STORAGE_KEY).then((stored) => {
      if (stored === 'es' || stored === 'en') {
        setLocaleState(stored);
      }
    });
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    AsyncStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
  }, []);

  const t = useCallback(
    (key: string, params?: Record<string, string | number>): string => {
      const raw = getNestedValue(
        translations[locale] as unknown as Record<string, unknown>,
        key
      );

      if (raw === undefined) {
        // Fallback: return the key itself
        return key;
      }

      if (!params) return raw;

      // Process plurals first, then interpolation
      let result = processPlurals(raw, params);
      result = processInterpolation(result, params);
      return result;
    },
    [locale]
  );

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

// ─── Hook ───────────────────────────────────────────────────────────────────

/**
 * Hook to access translation function and locale management.
 */
export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}
