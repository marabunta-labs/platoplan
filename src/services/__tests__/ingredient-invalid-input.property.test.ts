/**
 * Property-Based Test: Ingredient form rejects invalid inputs
 *
 * Feature: platoplan-web-supabase, Property 2: Ingredient form rejects invalid inputs
 * Validates: Requirements 1.6
 *
 * For any ingredient form submission where any required field is empty, or the name
 * exceeds 100 characters, or the purchase format quantity is non-positive, the form
 * SHALL reject the submission and the database state SHALL remain unchanged.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { IngredientService } from '../ingredient.service';
import type { CreateIngredientInput } from '../../models/inputs';
import type { MeasureUnit } from '../../models/enums';
import type { ValidationError } from '../../models/errors';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('expo-sqlite', () => ({}));

const mockIngredientRepository = {
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  getById: vi.fn(),
  getAll: vi.fn(),
  search: vi.fn(),
  getRecipesUsingIngredient: vi.fn(),
};

vi.mock('../../repositories/ingredient.repository', () => ({
  IngredientRepository: class {
    constructor() {
      return mockIngredientRepository;
    }
  },
}));

vi.mock('../../database/database', () => ({
  generateId: vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2)),
}));

// ─── Custom Generators ──────────────────────────────────────────────────────

/** Valid unit values */
const VALID_UNITS: MeasureUnit[] = ['gramos', 'mililitros', 'unidades'];

/** Generates a valid unit */
const arbValidUnit: fc.Arbitrary<MeasureUnit> = fc.constantFrom(...VALID_UNITS);

/** Generates an invalid unit (string that is not in VALID_UNITS) */
const arbInvalidUnit: fc.Arbitrary<string> = fc
  .string({ minLength: 1, maxLength: 20 })
  .filter((s) => !VALID_UNITS.includes(s as MeasureUnit));

/** Generates a valid ingredient name: non-empty, max 100 chars, trimmed non-empty */
const arbValidName = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Generates an empty or whitespace-only name */
const arbEmptyName: fc.Arbitrary<string> = fc.constantFrom('', ' ', '  ', '\t', '\n', '   \t\n  ');

/** Generates a name exceeding 100 characters */
const arbLongName: fc.Arbitrary<string> = fc
  .string({ minLength: 101, maxLength: 200 })
  .filter((s) => s.trim().length > 0);

/** Generates a valid non-empty category */
const arbValidCategory = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/** Generates a valid non-empty purchase format description */
const arbValidDescription = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Generates a valid positive quantity */
const arbPositiveQuantity = fc.double({
  min: 0.01,
  max: 10000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Generates a non-positive quantity (0 or negative) */
const arbNonPositiveQuantity: fc.Arbitrary<number> = fc.oneof(
  fc.constant(0),
  fc.double({ min: -10000, max: -0.001, noNaN: true, noDefaultInfinity: true })
);

/** Generates a valid CreateIngredientInput (used as base for invalid mutations) */
const arbValidInput: fc.Arbitrary<CreateIngredientInput> = fc.record({
  name: arbValidName,
  unit: arbValidUnit,
  purchaseFormat: fc.record({
    description: arbValidDescription,
    quantity: arbPositiveQuantity,
  }),
  category: arbValidCategory,
});

// ─── Helper Functions ───────────────────────────────────────────────────────

function createMockDb() {
  return {
    runAsync: vi.fn().mockResolvedValue({ changes: 1 }),
    getFirstAsync: vi.fn().mockResolvedValue(null),
    getAllAsync: vi.fn().mockResolvedValue([]),
    execAsync: vi.fn().mockResolvedValue(undefined),
  } as any;
}

function isValidationError(error: unknown): error is ValidationError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error as any).type === 'validation'
  );
}

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Feature: platoplan-web-supabase, Property 2: Ingredient form rejects invalid inputs', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIngredientRepository.getAll.mockResolvedValue([]);
    mockIngredientRepository.create.mockClear();
  });

  /**
   * Property 2: Ingredient form rejects invalid inputs
   *
   * For any ingredient form submission where any required field is empty, or the name
   * exceeds 100 characters, or the purchase format quantity is non-positive, the form
   * SHALL reject the submission and the database state SHALL remain unchanged.
   *
   * **Validates: Requirements 1.6**
   */

  it('rejects empty or whitespace-only name and does not write to database', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbEmptyName,
        arbValidUnit,
        arbValidDescription,
        arbPositiveQuantity,
        arbValidCategory,
        async (name, unit, description, quantity, category) => {
          vi.clearAllMocks();
          mockIngredientRepository.getAll.mockResolvedValue([]);

          const db = createMockDb();
          const service = new IngredientService(db);

          const input: CreateIngredientInput = {
            name,
            unit,
            purchaseFormat: { description, quantity },
            category,
          };

          let thrown: unknown;
          try {
            await service.create(input);
          } catch (e) {
            thrown = e;
          }

          // Must throw a validation error
          expect(thrown).toBeDefined();
          expect(isValidationError(thrown)).toBe(true);
          if (isValidationError(thrown)) {
            expect(thrown.fields.some((f) => f.field === 'name')).toBe(true);
          }

          // Database must not be modified
          expect(mockIngredientRepository.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects name exceeding 100 characters and does not write to database', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbLongName,
        arbValidUnit,
        arbValidDescription,
        arbPositiveQuantity,
        arbValidCategory,
        async (name, unit, description, quantity, category) => {
          vi.clearAllMocks();
          mockIngredientRepository.getAll.mockResolvedValue([]);

          const db = createMockDb();
          const service = new IngredientService(db);

          const input: CreateIngredientInput = {
            name,
            unit,
            purchaseFormat: { description, quantity },
            category,
          };

          let thrown: unknown;
          try {
            await service.create(input);
          } catch (e) {
            thrown = e;
          }

          // Must throw a validation error
          expect(thrown).toBeDefined();
          expect(isValidationError(thrown)).toBe(true);
          if (isValidationError(thrown)) {
            expect(thrown.fields.some((f) => f.field === 'name')).toBe(true);
          }

          // Database must not be modified
          expect(mockIngredientRepository.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects empty purchase format description and does not write to database', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidName,
        arbValidUnit,
        fc.constantFrom('', ' ', '  ', '\t'),
        arbPositiveQuantity,
        arbValidCategory,
        async (name, unit, description, quantity, category) => {
          vi.clearAllMocks();
          mockIngredientRepository.getAll.mockResolvedValue([]);

          const db = createMockDb();
          const service = new IngredientService(db);

          const input: CreateIngredientInput = {
            name,
            unit,
            purchaseFormat: { description, quantity },
            category,
          };

          let thrown: unknown;
          try {
            await service.create(input);
          } catch (e) {
            thrown = e;
          }

          // Must throw a validation error
          expect(thrown).toBeDefined();
          expect(isValidationError(thrown)).toBe(true);
          if (isValidationError(thrown)) {
            expect(
              thrown.fields.some((f) => f.field === 'purchaseFormat.description')
            ).toBe(true);
          }

          // Database must not be modified
          expect(mockIngredientRepository.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects non-positive purchase format quantity and does not write to database', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidName,
        arbValidUnit,
        arbValidDescription,
        arbNonPositiveQuantity,
        arbValidCategory,
        async (name, unit, description, quantity, category) => {
          vi.clearAllMocks();
          mockIngredientRepository.getAll.mockResolvedValue([]);

          const db = createMockDb();
          const service = new IngredientService(db);

          const input: CreateIngredientInput = {
            name,
            unit,
            purchaseFormat: { description, quantity },
            category,
          };

          let thrown: unknown;
          try {
            await service.create(input);
          } catch (e) {
            thrown = e;
          }

          // Must throw a validation error
          expect(thrown).toBeDefined();
          expect(isValidationError(thrown)).toBe(true);
          if (isValidationError(thrown)) {
            expect(
              thrown.fields.some((f) => f.field === 'purchaseFormat.quantity')
            ).toBe(true);
          }

          // Database must not be modified
          expect(mockIngredientRepository.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects invalid unit and does not write to database', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidName,
        arbInvalidUnit,
        arbValidDescription,
        arbPositiveQuantity,
        arbValidCategory,
        async (name, unit, description, quantity, category) => {
          vi.clearAllMocks();
          mockIngredientRepository.getAll.mockResolvedValue([]);

          const db = createMockDb();
          const service = new IngredientService(db);

          const input: CreateIngredientInput = {
            name,
            unit: unit as MeasureUnit,
            purchaseFormat: { description, quantity },
            category,
          };

          let thrown: unknown;
          try {
            await service.create(input);
          } catch (e) {
            thrown = e;
          }

          // Must throw a validation error
          expect(thrown).toBeDefined();
          expect(isValidationError(thrown)).toBe(true);
          if (isValidationError(thrown)) {
            expect(thrown.fields.some((f) => f.field === 'unit')).toBe(true);
          }

          // Database must not be modified
          expect(mockIngredientRepository.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });

  it('rejects input with null/undefined category and does not write to database', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbValidName,
        arbValidUnit,
        arbValidDescription,
        arbPositiveQuantity,
        fc.constantFrom(null, undefined),
        async (name, unit, description, quantity, category) => {
          vi.clearAllMocks();
          mockIngredientRepository.getAll.mockResolvedValue([]);

          const db = createMockDb();
          const service = new IngredientService(db);

          const input: CreateIngredientInput = {
            name,
            unit,
            purchaseFormat: { description, quantity },
            category: category as unknown as string,
          };

          let thrown: unknown;
          try {
            await service.create(input);
          } catch (e) {
            thrown = e;
          }

          // Must throw a validation error
          expect(thrown).toBeDefined();
          expect(isValidationError(thrown)).toBe(true);
          if (isValidationError(thrown)) {
            expect(thrown.fields.some((f) => f.field === 'category')).toBe(true);
          }

          // Database must not be modified
          expect(mockIngredientRepository.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
