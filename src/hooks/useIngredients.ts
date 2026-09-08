/**
 * PlatoPlan - useIngredients hook
 * Connects ingredient screens to the IngredientService via DatabaseContext.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Ingredient } from '../models/types';
import type { CreateIngredientInput, UpdateIngredientInput } from '../models/inputs';
import { useDatabase } from '../context/DatabaseContext';
import { IngredientService } from '../services/ingredient.service';
import { useTableInvalidation } from './useTableInvalidation';
import { tableInvalidationEmitter } from './tableInvalidationEmitter';

export function useIngredients() {
  const db = useDatabase();
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const service = new IngredientService(db);

  const loadIngredients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await service.getAll();
      setIngredients(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar ingredientes');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadIngredients();
  }, [loadIngredients]);

  // Re-fetch when remote changes invalidate the ingredients table
  useTableInvalidation(['ingredients'], loadIngredients);

  const createIngredient = useCallback(
    async (input: CreateIngredientInput) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.create(input);
        await loadIngredients();
        tableInvalidationEmitter.emit('ingredients');
        return result;
      } catch (e: unknown) {
        const err = e as { type?: string; fields?: { message: string }[]; message?: string };
        if (err.type === 'validation' && err.fields) {
          setError(err.fields.map((f) => f.message).join('. '));
        } else if (err.type === 'conflict' && err.message) {
          setError(err.message);
        } else {
          setError(e instanceof Error ? e.message : 'Error al crear ingrediente');
        }
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadIngredients]
  );

  const updateIngredient = useCallback(
    async (id: string, input: UpdateIngredientInput) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.update(id, input);
        await loadIngredients();
        tableInvalidationEmitter.emit('ingredients');
        tableInvalidationEmitter.emit('recipe_ingredients');
        return result;
      } catch (e: unknown) {
        const err = e as { type?: string; fields?: { message: string }[]; message?: string };
        if (err.type === 'validation' && err.fields) {
          setError(err.fields.map((f) => f.message).join('. '));
        } else if (err.type === 'conflict' && err.message) {
          setError(err.message);
        } else {
          setError(e instanceof Error ? e.message : 'Error al actualizar ingrediente');
        }
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadIngredients]
  );

  const deleteIngredient = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.delete(id);
        await loadIngredients();
        // Deleting an ingredient cascades into recipes, pantry and shopping lists.
        tableInvalidationEmitter.emit('ingredients');
        tableInvalidationEmitter.emit('recipe_ingredients');
        tableInvalidationEmitter.emit('recipes');
        tableInvalidationEmitter.emit('pantry_entries');
        tableInvalidationEmitter.emit('shopping_list_items');
        return result;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al eliminar ingrediente');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadIngredients]
  );

  const searchIngredients = useCallback(
    async (query: string) => {
      try {
        const results = await service.search(query);
        return results;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al buscar ingredientes');
        return [];
      }
    },
    [db]
  );

  const getRecipesUsing = useCallback(
    async (ingredientId: string) => {
      try {
        return await service.getRecipesUsing(ingredientId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al obtener recetas');
        return [];
      }
    },
    [db]
  );

  return {
    ingredients,
    loading,
    error,
    createIngredient,
    updateIngredient,
    deleteIngredient,
    searchIngredients,
    getRecipesUsing,
    refresh: loadIngredients,
  };
}
