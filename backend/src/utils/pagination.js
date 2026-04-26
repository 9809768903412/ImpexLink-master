function parsePagination(query) {
  const page = query.page ? Number(query.page) : null;
  const pageSize = query.pageSize ? Number(query.pageSize) : null;
  if (!page || !pageSize || Number.isNaN(page) || Number.isNaN(pageSize)) {
    return null;
  }
  return {
    page: Math.max(page, 1),
    pageSize: Math.min(Math.max(pageSize, 1), 100),
  };
}

function buildPaginatedResponse(data, total, page, pageSize) {
  return {
    data,
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize),
  };
}

function parseSort(query, allowed = []) {
  const sortBy = query.sortBy ? String(query.sortBy) : null;
  const sortDir = query.sortDir ? String(query.sortDir).toLowerCase() : 'asc';
  if (!sortBy || !allowed.includes(sortBy)) return null;
  return { sortBy, sortDir: sortDir === 'desc' ? 'desc' : 'asc' };
}

module.exports = { parsePagination, buildPaginatedResponse, parseSort };
