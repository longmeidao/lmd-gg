import slateConfig from '~@/slate.config';

export interface PaginationMeta {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
}

export const getPageSize = () => slateConfig.pagination?.pageSize ?? 20;

export const getPageCount = (totalItems: number, pageSize: number) => {
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError('pagination.pageSize 必须是大于 0 的整数');
  }
  return Math.max(1, Math.ceil(totalItems / pageSize));
};

export const paginateItems = <T>(
  items: T[],
  currentPage: number,
  pageSize: number,
): { items: T[]; meta: PaginationMeta } => {
  const totalPages = getPageCount(items.length, pageSize);
  if (
    !Number.isInteger(currentPage) ||
    currentPage < 1 ||
    currentPage > totalPages
  ) {
    throw new RangeError(`分页页码超出范围：${currentPage}/${totalPages}`);
  }

  const start = (currentPage - 1) * pageSize;
  return {
    items: items.slice(start, start + pageSize),
    meta: {
      currentPage,
      totalPages,
      pageSize,
      totalItems: items.length,
    },
  };
};

export const getPaginationHref = (basePath: string, page: number) => {
  if (!Number.isInteger(page) || page < 1) {
    throw new RangeError(`分页页码必须是大于 0 的整数：${page}`);
  }
  const normalized = basePath === '/' ? '' : basePath.replace(/\/+$/, '');
  return page === 1 ? normalized || '/' : `${normalized}/page/${page}`;
};
