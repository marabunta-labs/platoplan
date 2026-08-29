/**
 * PlatoPlan - usePantry hook
 * Connects pantry screens to the PantryService via DatabaseContext.
 */

import { useState, useEffect, useCallback } from 'react';
import type { PantryEntry, Recipe } from '../models/types';
import { useDatabase } from '../context/DatabaseContext';
import { PantryService } from '../services/pantry.service';
import { useTableInvalidation } from './useTableInvalidation';

export function usePantry() {
  const db = useDatabase();
  const [pantryEntries, setPantryEntries] = useState<PantryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const service = new PantryService(db);

  const loadPantry = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await service.getAll();
      setPantryEntries(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar la despensa');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadPantry();
  }, [loadPantry]);

  // Re-fetch when remote changes invalidate the pantry_entries table
  useTableInvalidation(['pantry_entries'], loadPantry);

  const addOrUpdateEntry = useCallback(
    async (ingredientId: string, quantity: number) => {
      setLoading(true);
      setError(null);
      try {
        await service.addOrUpdate({ id: '', ingredientId, quantity, updatedAt: new Date() });
        await loadPantry();
      } catch (e: unknown) {
        const err = e as { type?: string; fields?: { message: string }[]; message?: string };
        if (err.type === 'validation' && err.fields) {
          setError(err.fields.map((f) => f.message).join('. '));
        } else {
          setError(e instanceof Error ? e.message : 'Error al actualizar despensa');
        }
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadPantry]
  );

  const removeEntry = useCallback(
    async (ingredientId: string) => {
      setLoading(true);
      setError(null);
      try {
        await service.remove(ingredientId);
        await loadPantry();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al eliminar de despensa');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadPantry]
  );

  const getPreparableRecipes = useCallback(async (): Promise<{
    full: Recipe[];
    partial: Recipe[];
  }> => {
    try {
      return await service.getPreparableRecipes();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al obtener recetas preparables');
      return { full: [], partial: [] };
    }
  }, [db]);

  return {
    pantryEntries,
    loading,
    error,
    addOrUpdateEntry,
    removeEntry,
    getPreparableRecipes,
    refresh: loadPantry,
  };
}
