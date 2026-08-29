/**
 * PlatoPlan - useShoppingList hook
 * Connects shopping list screen to the ShoppingListService via DatabaseContext.
 */

import { useState, useCallback, useRef } from 'react';
import type { ShoppingList } from '../models/types';
import { useDatabase } from '../context/DatabaseContext';
import { ShoppingListService } from '../services/shopping-list.service';
import { useTableInvalidation } from './useTableInvalidation';

export function useShoppingList() {
  const db = useDatabase();
  const [shoppingList, setShoppingList] = useState<ShoppingList | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const currentPlanIdRef = useRef<string | null>(null);

  const service = new ShoppingListService(db);

  const loadByPlanId = useCallback(
    async (planId: string) => {
      currentPlanIdRef.current = planId;
      setLoading(true);
      setError(null);
      try {
        const list = await service.getByPlanId(planId);
        setShoppingList(list);
        return list;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cargar la lista de compra');
        return null;
      } finally {
        setLoading(false);
      }
    },
    [db]
  );

  // Re-fetch the current shopping list when remote changes invalidate the table
  const refreshShoppingList = useCallback(() => {
    if (currentPlanIdRef.current) {
      loadByPlanId(currentPlanIdRef.current);
    }
  }, [loadByPlanId]);

  useTableInvalidation(['shopping_lists', 'shopping_list_items'], refreshShoppingList);

  const generate = useCallback(
    async (planId: string) => {
      setLoading(true);
      setError(null);
      try {
        await service.generate(planId);
        // The persisted list is re-read with ingredient details for display.
        return await loadByPlanId(planId);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al generar la lista de compra');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadByPlanId]
  );

  const editQuantity = useCallback(
    async (listId: string, itemId: string, quantity: number) => {
      setLoading(true);
      setError(null);
      try {
        await service.editQuantity(listId, itemId, quantity);
        // Re-load so joined ingredient information used by the web UI remains present.
        const updated = await loadByPlanId(currentPlanIdRef.current ?? '');
        return updated;
      } catch (e: unknown) {
        const err = e as { type?: string; fields?: { message: string }[]; message?: string };
        if (err.type === 'validation' && err.fields) {
          setError(err.fields.map((f) => f.message).join('. '));
        } else {
          setError(e instanceof Error ? e.message : 'Error al editar cantidad');
        }
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadByPlanId]
  );

  const removeItem = useCallback(
    async (listId: string, itemId: string) => {
      setLoading(true);
      setError(null);
      try {
        await service.removeItem(listId, itemId);
        return await loadByPlanId(currentPlanIdRef.current ?? '');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al eliminar artículo');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db, loadByPlanId]
  );

  const regenerate = useCallback(
    async (listId: string) => {
      setLoading(true);
      setError(null);
      try {
        const updated = await service.regenerate(listId);
        setShoppingList(updated);
        return updated;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al regenerar la lista');
        throw e;
      } finally {
        setLoading(false);
      }
    },
    [db]
  );

  return {
    shoppingList,
    loading,
    error,
    generate,
    editQuantity,
    removeItem,
    regenerate,
    loadByPlanId,
  };
}
