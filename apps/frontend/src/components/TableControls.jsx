import { useEffect, useMemo, useState } from 'react';

function compareValues(a, b) {
  const aEmpty = a == null || a === '';
  const bEmpty = b == null || b === '';
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1;
  if (bEmpty) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Client-side sorting + pagination over an already-loaded list.
 * `accessors` maps a sort key to a function returning the comparable value.
 */
export function useSortedPagination(rows, { accessors, initialSortKey = null, initialDir = 'desc', initialPageSize = 10 }) {
  const [sortKey, setSortKey] = useState(initialSortKey);
  const [sortDir, setSortDir] = useState(initialDir);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const sorted = useMemo(() => {
    const list = [...(rows || [])];
    const accessor = sortKey && accessors[sortKey];
    if (!accessor) return list;
    list.sort((x, y) => {
      const result = compareValues(accessor(x), accessor(y));
      return sortDir === 'asc' ? result : -result;
    });
    return list;
  }, [rows, sortKey, sortDir, accessors]);

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  useEffect(() => {
    setPage(1);
  }, [rows, sortKey, sortDir, pageSize]);

  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const pageRows = sorted.slice(start, start + pageSize);

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  return {
    pageRows,
    total,
    totalPages,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    sortKey,
    sortDir,
    toggleSort,
    rangeStart: total ? start + 1 : 0,
    rangeEnd: Math.min(start + pageSize, total)
  };
}

export function SortableTh({ label, sortKey, table, style }) {
  const active = table.sortKey === sortKey;
  const arrow = active ? (table.sortDir === 'asc' ? '▲' : '▼') : '↕';
  return (
    <th
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap', ...style }}
      onClick={() => table.toggleSort(sortKey)}
      aria-sort={active ? (table.sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={`Sort by ${label}`}
    >
      {label}{' '}
      <span style={{ fontSize: 10, color: active ? 'var(--primary)' : '#94a3b8' }}>{arrow}</span>
    </th>
  );
}

export function PaginationBar({ table, pageSizeOptions = [10, 25, 50] }) {
  if (!table.total) return null;
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 12,
        flexWrap: 'wrap',
        marginTop: 12,
        fontSize: 13,
        color: 'var(--text-muted)'
      }}
    >
      <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        Rows per page
        <select
          className="input"
          style={{ width: 'auto', padding: '6px 10px' }}
          value={table.pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
        >
          {pageSizeOptions.map((n) => (
            <option key={n} value={n}>{n}</option>
          ))}
        </select>
      </label>
      <span>
        {table.rangeStart}–{table.rangeEnd} of {table.total}
      </span>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '6px 12px' }}
          disabled={table.page <= 1}
          onClick={() => table.setPage(table.page - 1)}
        >
          Prev
        </button>
        <span>
          Page {table.page} of {table.totalPages}
        </span>
        <button
          type="button"
          className="btn btn-secondary"
          style={{ padding: '6px 12px' }}
          disabled={table.page >= table.totalPages}
          onClick={() => table.setPage(table.page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
