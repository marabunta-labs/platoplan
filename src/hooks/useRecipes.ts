/**
 * PlatoPlan - useRecipes hook
 * Connects recipe screens to the RecipeService via DatabaseContext.
 */

import { useState, useEffect, useCallback } from 'react';
import type { Recipe } from '../models/types';
import type { MealType } from '../models/enums';
import type { CreateRecipeInput, UpdateRecipeInput } from '../models/inputs';
import { useDatabase } from '../context/DatabaseContext';
import { createRecipeService } from '../services/recipe.service';
import { useTableInvalidation } from './useTableInvalidation';
import { tableInvalidationEmitter } from './tableInvalidationEmitter';

export function useRecipes() {
  const db = useDatabase();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const service = createRecipeService(db);

  const loadRecipes = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await service.getAll();
      setRecipes(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar recetas');
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => {
    loadRecipes();
  }, [loadRecipes]);

  // Re-fetch when remote changes invalidate the recipes or recipe_ingredients tables
  useTableInvalidation(['recipes', 'recipe_ingredients'], loadRecipes);

  const createRecipe = useCallback(
    async (input: CreateRecipeInput) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.create(input);
        if (!result.success) {
          const msg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : 'message' in result.error
                ? result.error.message
                : 'Error de validación';
          setError(msg);
          return result;
        }
        await loadRecipes();
        tableInvalidationEmitter.emit('recipes');
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al crear receta';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadRecipes]
  );

  const updateRecipe = useCallback(
    async (id: string, input: UpdateRecipeInput) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.update(id, input);
        if (!result.success) {
          const msg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : 'message' in result.error
                ? result.error.message
                : 'Error de validación';
          setError(msg);
          return result;
        }
        await loadRecipes();
        tableInvalidationEmitter.emit('recipes');
        tableInvalidationEmitter.emit('recipe_ingredients');
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al actualizar receta';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadRecipes]
  );

  const deleteRecipe = useCallback(
    async (id: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await service.delete(id);
        if (!result.success) {
          const msg =
            result.error.type === 'validation'
              ? result.error.fields.map((f) => f.message).join('. ')
              : 'Error al eliminar receta';
          setError(msg);
          return result;
        }
        await loadRecipes();
        // Deleting a recipe cascades into plan assignments; refresh those too.
        tableInvalidationEmitter.emit('recipes');
        tableInvalidationEmitter.emit('recipe_ingredients');
        tableInvalidationEmitter.emit('plan_assignments');
        return result;
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error al eliminar receta';
        setError(msg);
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadRecipes]
  );

  const searchRecipes = useCallback(
    async (query: string) => {
      try {
        const results = await service.search(query);
        return results;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al buscar recetas');
        return [];
      }
    },
    [db]
  );

  const getByMealType = useCallback(
    async (type: MealType) => {
      try {
        const results = await service.getByMealType(type);
        return results;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al filtrar recetas');
        return [];
      }
    },
    [db]
  );

  return {
    recipes,
    loading,
    error,
    createRecipe,
    updateRecipe,
    deleteRecipe,
    searchRecipes,
    getByMealType,
    refresh: loadRecipes,
  };
}
