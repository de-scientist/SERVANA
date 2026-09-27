import { slugify, randomSuffix } from './slug';

describe('slug', () => {
  it('slugifies names to url-safe dashes', () => {
    expect(slugify('Jane Beauty Studio')).toBe('jane-beauty-studio');
    expect(slugify('  Nairobi & Co.  ')).toBe('nairobi-co');
  });

  it('collapses repeats and truncates', () => {
    expect(slugify('a___b---c')).toBe('a-b-c');
  });

  it('produces a random suffix of the requested length', () => {
    expect(randomSuffix(6)).toHaveLength(6);
  });
});
