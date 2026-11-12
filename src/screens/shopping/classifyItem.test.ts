import { describe, it, expect } from 'vitest';
import { classifyItem, reviewStatusOf } from './classifyItem';

describe('reviewStatusOf', () => {
  it('is unknown until the user answers, even if the pantry covers everything', () => {
    expect(reviewStatusOf({}, 'sal')).toBe('unknown');
  });

  it('returns the user answer', () => {
    expect(reviewStatusOf({ sal: 'confirmed', pan: 'none' }, 'sal')).toBe('confirmed');
    expect(reviewStatusOf({ sal: 'confirmed', pan: 'none' }, 'pan')).toBe('none');
  });
});

describe('classifyItem', () => {
  it('keeps unreviewed items pending whether or not the pantry covers them', () => {
    expect(classifyItem('unknown', 0)).toBe('pending');
    expect(classifyItem('unknown', 3)).toBe('pending');
  });

  it('sends "I don\'t have it" to buy', () => {
    expect(classifyItem('none', 0)).toBe('buy');
  });

  it('sends confirmed items to done only when nothing is left to buy', () => {
    expect(classifyItem('confirmed', 0)).toBe('done');
    expect(classifyItem('confirmed', 2)).toBe('buy');
  });
});
