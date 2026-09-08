/**
 * PlatoPlan - Database Context
 * Provides the SQLite database instance to all components via React Context.
 * Handles initialization on mount and shows loading/error states.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import type { SQLiteDatabase } from 'expo-sqlite';
import { initializeDatabase } from '../database/database';
import { seedSampleDataIfEmpty } from '../database/seed';

interface DatabaseContextValue {
  db: SQLiteDatabase;
}

const DatabaseContext = createContext<DatabaseContextValue | null>(null);

interface DatabaseProviderProps {
  children: React.ReactNode;
}

/**
 * DatabaseProvider initializes the SQLite database on mount and provides
 * the instance to all child components via context.
 * Shows a loading indicator while initializing and an error message on failure.
 */
export function DatabaseProvider({ children }: DatabaseProviderProps) {
  const [db, setDb] = useState<SQLiteDatabase | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const database = await initializeDatabase();
        // Seed realistic sample data ONLY in development (never in production
        // builds). No-op once data exists. Best-effort: never block app start.
        if (__DEV__) {
          try {
            await seedSampleDataIfEmpty(database);
          } catch (seedError) {
            console.warn('Sample data seeding skipped:', seedError);
          }
        }
        if (!cancelled) {
          setDb(database);
        }
      } catch (e) {
        if (!cancelled) {
          const message =
            e instanceof Error ? e.message : 'Error desconocido al inicializar la base de datos';
          setError(message);
        }
      }
    }

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Error al iniciar la base de datos</Text>
        <Text style={styles.errorDetail}>{error}</Text>
      </View>
    );
  }

  if (!db) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={styles.loadingText}>Iniciando PlatoPlan...</Text>
      </View>
    );
  }

  return (
    <DatabaseContext.Provider value={{ db }}>
      {children}
    </DatabaseContext.Provider>
  );
}

/**
 * Hook to access the database instance from any component within DatabaseProvider.
 * Throws if used outside of DatabaseProvider.
 */
export function useDatabase(): SQLiteDatabase {
  const context = useContext(DatabaseContext);
  if (!context) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context.db;
}

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    padding: 24,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#555',
  },
  errorText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#c00',
    marginBottom: 8,
  },
  errorDetail: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
});
