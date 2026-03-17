type AdminTableProps = {
  title: string;
  columns: string[];
  rows: string[][];
};

export function AdminTable({ title, columns, rows }: AdminTableProps) {
  return (
    <section className="panel overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
        <h2 className="text-sm font-semibold text-brand-900">{title}</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-white text-slate-500">
            <tr>
              {columns.map((column) => (
                <th key={column} className="whitespace-nowrap border-b border-slate-200 px-4 py-3 font-medium">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={`${title}-${rowIndex}`} className="bg-white">
                {row.map((cell, cellIndex) => (
                  <td key={`${title}-${rowIndex}-${cellIndex}`} className="whitespace-nowrap border-b border-slate-100 px-4 py-3">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
