/**
 * PlatoPlan - Table Invalidation Emitter tests
 *
 * Validates the pub/sub system that signals data refreshes when remote
 * changes arrive via Supabase Realtime.
 *
 * Requirements: 6.5
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { tableInvalidationEmitter } from '../tableInvalidationEmitter';

describe('TableInvalidationEmitter', () => {
  beforeEach(() => {
    tableInvalidationEmitter.clear();
  });

  it('should notify a listener when its table is emitted', () => {
    const listener = vi.fn();
    tableInvalidationEmitter.subscribe('ingredients', listener);

    tableInvalidationEmitter.emit('ingredients');

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('should not notify a listener for a different table', () => {
    const listener = vi.fn();
    tableInvalidationEmitter.subscribe('ingredients', listener);

    tableInvalidationEmitter.emit('recipes');

    expect(listener).not.toHaveBeenCalled();
  });

  it('should support multiple listeners on the same table', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    tableInvalidationEmitter.subscribe('recipes', listener1);
    tableInvalidationEmitter.subscribe('recipes', listener2);

    tableInvalidationEmitter.emit('recipes');

    expect(listener1).toHaveBeenCalledTimes(1);
    expect(listener2).toHaveBeenCalledTimes(1);
  });

  it('should allow unsubscribing a listener', () => {
    const listener = vi.fn();
    const unsubscribe = tableInvalidationEmitter.subscribe('pantry_entries', listener);

    tableInvalidationEmitter.emit('pantry_entries');
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();
    tableInvalidationEmitter.emit('pantry_entries');
    expect(listener).toHaveBeenCalledTimes(1); // not called again
  });

  it('should support listeners on multiple different tables', () => {
    const ingredientListener = vi.fn();
    const recipeListener = vi.fn();
    tableInvalidationEmitter.subscribe('ingredients', ingredientListener);
    tableInvalidationEmitter.subscribe('recipes', recipeListener);

    tableInvalidationEmitter.emit('ingredients');

    expect(ingredientListener).toHaveBeenCalledTimes(1);
    expect(recipeListener).not.toHaveBeenCalled();
  });

  it('should handle emitting a table with no listeners gracefully', () => {
    expect(() => {
      tableInvalidationEmitter.emit('nonexistent_table');
    }).not.toThrow();
  });

  it('should clean up empty listener sets after all listeners unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = tableInvalidationEmitter.subscribe('ingredients', listener);

    unsubscribe();

    // Emitting should not throw or call anything
    tableInvalidationEmitter.emit('ingredients');
    expect(listener).not.toHaveBeenCalled();
  });

  it('clear() should remove all listeners', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    tableInvalidationEmitter.subscribe('ingredients', listener1);
    tableInvalidationEmitter.subscribe('recipes', listener2);

    tableInvalidationEmitter.clear();

    tableInvalidationEmitter.emit('ingredients');
    tableInvalidationEmitter.emit('recipes');

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });
});
