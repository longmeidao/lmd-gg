import { describe, expect, it } from 'vitest';
import {
  getPageCount,
  getPaginationHref,
  paginateItems,
} from '../src/helpers/pagination';

describe('feed pagination', () => {
  it('does not create another page at the page-size boundary', () => {
    expect(getPageCount(20, 20)).toBe(1);
    expect(paginateItems(Array.from({ length: 20 }), 1, 20).items).toHaveLength(
      20,
    );
  });

  it('creates a second page only after the boundary is exceeded', () => {
    const result = paginateItems(
      Array.from({ length: 21 }, (_, index) => index),
      2,
      20,
    );
    expect(result.items).toEqual([20]);
    expect(result.meta.totalPages).toBe(2);
  });

  it('builds clean static paths without trailing slashes', () => {
    expect(getPaginationHref('/', 1)).toBe('/');
    expect(getPaginationHref('/', 2)).toBe('/page/2');
    expect(getPaginationHref('/featured/', 2)).toBe('/featured/page/2');
  });

  it('rejects invalid configuration and page numbers', () => {
    expect(() => getPageCount(20, 0)).toThrow(RangeError);
    expect(() => paginateItems([1], 2, 20)).toThrow(RangeError);
    expect(() => getPaginationHref('/', 0)).toThrow(RangeError);
  });
});
