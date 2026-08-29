/**
 * PlatoPlan - useTableInvalidation hook
 *
 * Utility hook that subscribes a refresh callback to one or more table
 * invalidation events. When a remote change updates the local SQLite cache
 * for any of the specified tables, the refresh callback is automatically invoked.
 *
 * Usage in data hooks:
 * ```ts
 * function useIngredients() {
 *   const loadIngredients = useCallback(async () => { ... }, [db]);
 *   useTableInvalidation(['ingredients'], loadIngredients);
 *   // ...
 * }
 * ```
 *
 * Requirements: 6.5
 */

import { useEffect } from 'react';
import { tableInvalidationEmitter } from './tableInvalidationEmitter';

/**
 * Subscribes to table invalidation events and calls the provided refresh
 * function when any of the specified tables are updated by a remote change.
 *
 * @param tables - Array of table names to listen for invalidation
 * @param onInvalidate - Callback to invoke when any table is invalidated
 */
export function useTableInvalidation(
  tables: string[],
  onInvalidate: () => void
): void {
  useEffect(() => {
    const unsubscribers = tables.map((table) =>
      tableInvalidationEmitter.subscribe(table, onInvalidate)
    );

    return () => {
      for (const unsub of unsubscribers) {
        unsub();
      }
    };
  }, [tables, onInvalidate]);
}
