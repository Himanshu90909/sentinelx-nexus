import React from 'react';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T, index: number) => React.ReactNode;
  align?: 'left' | 'center' | 'right';
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField: keyof T | ((row: T, index: number) => string);
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  data,
  keyField,
  emptyMessage = 'No data available',
}: DataTableProps<T>) {
  const getKey = (row: T, index: number): string => {
    if (typeof keyField === 'function') {
      return keyField(row, index);
    }
    return String(row[keyField] ?? index);
  };

  if (!data || data.length === 0) {
    return (
      <div className="empty-state" style={{ padding: '24px' }}>
        <div className="empty-state-reason">{emptyMessage}</div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="dense-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th
                key={col.key}
                style={{
                  textAlign: col.align || 'left',
                  width: col.width,
                }}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, idx) => (
            <tr key={getKey(row, idx)}>
              {columns.map((col) => (
                <td
                  key={col.key}
                  style={{
                    textAlign: col.align || 'left',
                  }}
                >
                  {col.render
                    ? col.render(row, idx)
                    : (row as any)[col.key] !== undefined
                    ? String((row as any)[col.key])
                    : '-'}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
