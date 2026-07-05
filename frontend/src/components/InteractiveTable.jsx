import { useMemo, useState } from "react";
import { Filter, Search, X } from "lucide-react";

const NUMERIC_CELL_RE = /^[−-]?\s?[\d\s\u00a0.,]+(\s?(%|₽|\$|€|млн|млрд|тыс\.?|km|км|м|kg|кг))?$/i;

function cellText(v) {
  if (v === null || v === undefined) return "";
  return String(v);
}

function formatCell(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") {
    return Number.isInteger(v) ? String(v) : v.toFixed(4).replace(/\.?0+$/, "");
  }
  return String(v);
}

function isNumericValue(v) {
  if (typeof v === "number") return true;
  const t = cellText(v).trim();
  return t !== "" && /\d/.test(t) && NUMERIC_CELL_RE.test(t);
}

function normalize(s) {
  return cellText(s).toLowerCase().trim();
}

function rowMatchesSearch(row, columns, query) {
  if (!query) return true;
  const q = normalize(query);
  return columns.some((c) => normalize(row[c.key]).includes(q));
}

function rowMatchesColumnFilters(row, columns, filters) {
  return columns.every((c) => {
    const f = filters[c.key]?.trim();
    if (!f) return true;
    return normalize(row[c.key]).includes(normalize(f));
  });
}

export function parseMarkdownTableChildren(children) {
  const columns = [];
  const rows = [];

  const textOf = (node) => {
    if (node === null || node === undefined) return "";
    if (typeof node === "string" || typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(textOf).join("");
    if (node?.props?.children !== undefined) return textOf(node.props.children);
    return "";
  };

  const visitSection = (section, isHeader) => {
    if (!section?.props?.children) return;
    const trList = Array.isArray(section.props.children)
      ? section.props.children
      : [section.props.children];

    for (const tr of trList) {
      if (!tr?.props?.children) continue;
      const cells = Array.isArray(tr.props.children)
        ? tr.props.children
        : [tr.props.children];
      const values = cells.map((cell) => textOf(cell?.props?.children ?? cell));

      if (isHeader) {
        values.forEach((label, i) => {
          columns.push({ key: `col${i}`, label: label || `Column ${i + 1}` });
        });
      } else if (columns.length) {
        const row = {};
        columns.forEach((c, i) => {
          row[c.key] = values[i] ?? "";
        });
        rows.push(row);
      }
    }
  };

  const sections = Array.isArray(children) ? children : [children];
  for (const section of sections) {
    if (!section) continue;
    const tag = section.type;
    if (tag === "thead") visitSection(section, true);
    if (tag === "tbody") visitSection(section, false);
  }

  return { columns, rows };
}

export default function InteractiveTable({
  columns: columnsProp,
  rows: rowsProp,
  title,
  maxRows = 500,
}) {
  const columns = columnsProp ?? [];
  const rows = rowsProp ?? [];

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [columnFilters, setColumnFilters] = useState({});

  const activeFilterCount = useMemo(
    () => Object.values(columnFilters).filter((v) => v?.trim()).length,
    [columnFilters],
  );

  const filteredRows = useMemo(() => {
    return rows.filter(
      (row) =>
        rowMatchesSearch(row, columns, search) &&
        rowMatchesColumnFilters(row, columns, columnFilters),
    );
  }, [rows, columns, search, columnFilters]);

  const displayedRows = filteredRows.slice(0, maxRows);
  const hasFilters = Boolean(search.trim()) || activeFilterCount > 0;

  const clearFilters = () => {
    setSearch("");
    setColumnFilters({});
  };

  if (!columns.length) return null;

  const showToolbar = rows.length > 0;

  return (
    <div className="md-table-interactive mt-3">
      {title ? <div className="md-table-title">{title}</div> : null}

      {showToolbar && (
        <div className="md-table-toolbar">
          <div className="md-table-search">
            <Search size={13} className="md-table-search__icon" aria-hidden />
            <input
              type="search"
              className="md-table-search__input"
              placeholder="Search table…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search table"
            />
            {search && (
              <button
                type="button"
                className="md-table-search__clear"
                onClick={() => setSearch("")}
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>

          <div className="md-table-toolbar__actions">
            <button
              type="button"
              className={`md-table-filter-btn${filtersOpen ? " is-open" : ""}${activeFilterCount ? " has-active" : ""}`}
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
              aria-label="Column filters"
              title="Column filters"
            >
              <Filter size={13} strokeWidth={2.2} />
              {activeFilterCount > 0 && (
                <span className="md-table-filter-btn__badge">{activeFilterCount}</span>
              )}
            </button>

            {hasFilters && (
              <button
                type="button"
                className="md-table-clear-btn"
                onClick={clearFilters}
              >
                Clear
              </button>
            )}

            <span className="md-table-count" aria-live="polite">
              {displayedRows.length === rows.length
                ? `${rows.length} rows`
                : `${displayedRows.length} / ${rows.length}`}
            </span>
          </div>
        </div>
      )}

      {filtersOpen && (
        <div className="md-table-filters">
          {columns.map((c) => (
            <label key={c.key} className="md-table-filter-field">
              <span className="md-table-filter-field__label">{c.label || c.key}</span>
              <input
                type="search"
                className="md-table-filter-field__input"
                placeholder="Filter…"
                value={columnFilters[c.key] ?? ""}
                onChange={(e) =>
                  setColumnFilters((prev) => ({ ...prev, [c.key]: e.target.value }))
                }
              />
            </label>
          ))}
        </div>
      )}

      <div className="markdown-table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key}>{c.label || c.key}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="md-table-empty">
                  No rows match your filters
                </td>
              </tr>
            ) : (
              displayedRows.map((row, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td
                      key={c.key}
                      className={isNumericValue(row[c.key]) ? "is-num" : undefined}
                    >
                      {formatCell(row[c.key])}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filteredRows.length > maxRows && (
        <div className="md-table-more">
          Showing first {maxRows} of {filteredRows.length} matching rows
        </div>
      )}
    </div>
  );
}
