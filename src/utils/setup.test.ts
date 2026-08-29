import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { es } from '../i18n/translations/es';
import { en } from '../i18n/translations/en';

describe('Project Setup', () => {
  it('should have vitest configured correctly', () => {
    expect(true).toBe(true);
  });

  it('should have fast-check configured correctly', () => {
    fc.assert(
      fc.property(fc.integer(), (n) => {
        return typeof n === 'number';
      }),
      { numRuns: 10 }
    );
  });
});

describe('i18n Translations', () => {
  it('should have matching top-level keys between es and en', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('should have matching nested keys between es and en for all sections', () => {
    for (const section of Object.keys(es) as (keyof typeof es)[]) {
      const esSection = es[section];
      const enSection = en[section];
      expect(Object.keys(esSection).sort()).toEqual(Object.keys(enSection).sort());
    }
  });

  it('should contain navigation, recipes, pantry, planning, shopping translations', () => {
    expect(es.navigation.recipes).toBe('Recetas');
    expect(en.navigation.recipes).toBe('Recipes');

    expect(es.pantry.whatCanICook).toBe('🍳 ¿Qué cocino?');
    expect(en.pantry.whatCanICook).toBe('🍳 What can I cook?');

    expect(es.recipes.saveChanges).toBe('Guardar cambios');
    expect(en.recipes.saveChanges).toBe('Save changes');

    expect(es.planning.configTitle).toBe('Configurar Plan');
    expect(en.planning.configTitle).toBe('Configure Plan');

    expect(es.shopping.title).toBe('Compra');
    expect(en.shopping.title).toBe('Shopping');
  });
});
