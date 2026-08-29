/**
 * PlatoPlan - Table Invalidation Emitter
 *
 * A lightweight pub/sub system for signaling when a table's data has been
 * updated by a remote change. UI hooks subscribe to their relevant tables
 * and trigger a refresh when notified.
 *
 * This is a singleton shared across the app — hooks subscribe on mount
 * and unsubscribe on unmount.
 *
 * Requirements: 6.5
 */

/** Callback type for table invalidation listeners. */
export type InvalidationListener = () => void;

/**
 * Simple event emitter for table-level data invalidation.
 * Components can subscribe to specific table names and receive
 * notifications when remote changes update that table's local cache.
 */
class TableInvalidationEmitter {
  private listeners: Map<string, Set<InvalidationListener>> = new Map();

  /**
   * Subscribe to invalidation events for a specific table.
   * @param table - The table name to listen for changes on
   * @param listener - Callback invoked when the table is invalidated
   * @returns Unsubscribe function
   */
  subscribe(table: string, listener: InvalidationListener): () => void {
    if (!this.listeners.has(table)) {
      this.listeners.set(table, new Set());
    }
    this.listeners.get(table)!.add(listener);

    return () => {
      const tableListeners = this.listeners.get(table);
      if (tableListeners) {
        tableListeners.delete(listener);
        if (tableListeners.size === 0) {
          this.listeners.delete(table);
        }
      }
    };
  }

  /**
   * Emit an invalidation event for a table, notifying all subscribers.
   * @param table - The table name that was invalidated
   */
  emit(table: string): void {
    const tableListeners = this.listeners.get(table);
    if (tableListeners) {
      for (const listener of tableListeners) {
        listener();
      }
    }
  }

  /**
   * Remove all listeners (useful for testing cleanup).
   */
  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Singleton instance of the table invalidation emitter.
 * Shared across all hooks and the useRealtimeSync bridge.
 */
export const tableInvalidationEmitter = new TableInvalidationEmitter();
