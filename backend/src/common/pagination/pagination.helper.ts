import { PaginatedResponse } from '../interfaces/api-response.interface';

export function createPaginationResponse<T>(
  items: T[],
  totalItems: number,
  page: number,
  limit: number,
): PaginatedResponse<T> {
  const totalPages = Math.ceil(totalItems / limit);
  return {
    items,
    meta: {
      totalItems,
      itemCount: items.length,
      itemsPerPage: limit,
      totalPages: totalPages === 0 ? 1 : totalPages,
      currentPage: page,
    },
  };
}
