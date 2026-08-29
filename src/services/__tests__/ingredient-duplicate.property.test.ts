/**
 * PlatoPlan - Ingredient Duplicate Detection Property Test
 *
 * Feature: platoplan-web-supabase, Property 1: Ingredient creation validates and rejects duplicates
 *
 * **Validates: Requirements 1.5**
 *
 * For any ingredient name that already exists in the database (case-insensitive),
 * attempting to create a new ingredient with that name SHALL be rejected and the
 * existing ingredient list SHALL remain unchanged.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import { IngredientService } from '../ingredient.service';
import type { Ingredient } from '../../models/types';
import type { CreateIngredientInput } from '../../models/inputs';
import type { ConflictError } from '../../models/errors';
import type { MeasureUnit } from '../../models/enums';

// ─── Mocks ──────────────────────────────────────────────────────────────────

vi.mock('expo-sqlite', () => ({}));

const mockRepository = {
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
      return mockRepository;
    }
  },
}));

// ─── Custom Generators ──────────────────────────────────────────────────────

const VALID_UNITS: MeasureUnit[] = ['gramos', 'mililitros', 'unidades'];

/** Generates a valid ingredient name (1-100 non-whitespace-only characters) */
const arbIngredientName = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Generates a valid MeasureUnit */
const arbUnit = fc.constantFrom(...VALID_UNITS);

/** Generates a positive quantity */
const arbPositiveQuantity = fc.double({
  min: 0.01,
  max: 10000,
  noNaN: true,
  noDefaultInfinity: true,
});

/** Generates a non-empty string for descriptions/categories */
const arbNonEmptyString = fc
  .string({ minLength: 1, maxLength: 50 })
  .filter((s) => s.trim().length > 0);

/** Generates a valid CreateIngredientInput with a specific name */
function arbValidInputWithName(name: string): fc.Arbitrary<CreateIngredientInput> {
  return fc.tuple(arbUnit, arbNonEmptyString, arbPositiveQuantity, arbNonEmptyString).map(
    ([unit, description, quantity, category]) => ({
      name,
      unit,
      purchaseFormat: { description, quantity },
      category,
    })
  );
}

/**
 * Generates a case variation of the given string.
 * Randomly toggles the case of individual characters.
 */
function arbCaseVariation(original: string): fc.Arbitrary<string> {
  if (original.length === 0) return fc.constant(original);

  return fc
    .array(fc.boolean(), { minLength: original.length, maxLength: original.length })
    .map((toggles) =>
      original
        .split('')
        .map((char, i) => (toggles[i] ? char.toUpperCase() : char.toLowerCase()))
        .join('')
    );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockDb() {
  return {} as any;
}

function mockIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id: 'ing-' + Math.random().toString(36).slice(2),
    name: 'TestIngredient',
    unit: 'gramos',
    purchaseFormat: { description: 'pack', quantity: 500 },
    category: 'General',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  };
}

// ─── Property Tests ─────────────────────────────────────────────────────────

describe('Feature: platoplan-web-supabase, Property 1: Ingredient creation validates and rejects duplicates', () => {
  let service: IngredientService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new IngredientService(createMockDb());
  });

  /**
   * Property 1: Ingredient creation validates and rejects duplicates
   *
   * For any ingredient name that already exists in the database (case-insensitive),
   * attempting to create a new ingredient with that name SHALL be rejected and the
   * existing ingredient list SHALL remain unchanged.
   *
   * **Validates: Requirements 1.5**
   */
  it('should reject creation of an ingredient with the same name (any case variation) when one already exists', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIngredientName,
        async (originalName) => {
          // Generate a case variation of the name
          const caseVariation = fc.sample(arbCaseVariation(originalName), 1)[0];
          // Generate a valid input for the duplicate attempt
          const duplicateInput = fc.sample(arbValidInputWithName(caseVariation), 1)[0];

          vi.clearAllMocks();
          service = new IngredientService(createMockDb());

          // Simulate existing ingredient in the DB
          const existingIngredient = mockIngredient({ name: originalName });
          mockRepository.getAll.mockResolvedValue([existingIngredient]);

          // Track that create should never be called
          mockRepository.create.mockClear();

          // Attempt to create a duplicate should throw ConflictError
          try {
            await service.create(duplicateInput);
            // If we reach here, the property is violated
            expect.fail(
              `Expected ConflictError for duplicate name "${caseVariation}" (existing: "${originalName}")`
            );
          } catch (e) {
            const err = e as ConflictError;
            expect(err.type).toBe('conflict');
            expect(err.existingId).toBe(existingIngredient.id);
          }

          // The repository create method should never have been called
          expect(mockRepository.create).not.toHaveBeenCalled();

          // The ingredient list should remain unchanged (still just the original)
          const allIngredients = await service.getAll();
          expect(allIngredients).toHaveLength(1);
          expect(allIngredients[0].name).toBe(originalName);
        }
      ),
      { numRuns: 100 }
    );
  });

  it('should reject duplicates regardless of leading/trailing whitespace differences in the existing name', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbIngredientName,
        fc.constantFrom('upper', 'lower', 'mixed'),
        async (baseName, caseStrategy) => {
          vi.clearAllMocks();
          service = new IngredientService(createMockDb());

          // Apply case strategy to create a variant
          let variantName: string;
          switch (caseStrategy) {
            case 'upper':
              variantName = baseName.toUpperCase();
              break;
            case 'lower':
              variantName = baseName.toLowerCase();
              break;
            case 'mixed':
              variantName = baseName
                .split('')
                .map((c, i) => (i % 2 === 0 ? c.toUpperCase() : c.toLowerCase()))
                .join('');
              break;
            default:
              variantName = baseName;
          }

          // Simulate existing ingredient
          const existingIngredient = mockIngredient({ name: baseName });
          mockRepository.getAll.mockResolvedValue([existingIngredient]);

          // Generate a valid input with the variant name
          const input = fc.sample(arbValidInputWithName(variantName), 1)[0];

          // Attempt to create should fail with conflict
          try {
            await service.create(input);
            expect.fail(
              `Expected ConflictError for "${variantName}" (existing: "${baseName}")`
            );
          } catch (e) {
            const err = e as ConflictError;
            expect(err.type).toBe('conflict');
          }

          // Repository create should not be called
          expect(mockRepository.create).not.toHaveBeenCalled();
        }
      ),
      { numRuns: 100 }
    );
  });
});
