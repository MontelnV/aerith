import { memo, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import ChartRenderer from "./ChartRenderer";
import InteractiveTable, { parseMarkdownTableChildren } from "./InteractiveTable";
import WebCitations from "./WebCitations";

const FENCE_RE = /```(chart|table|suggestions)\s*\n([\s\S]*?)\n```/g;

function parseBlocks(content) {
  const out = [];
  let last = 0;
  let m;
  FENCE_RE.lastIndex = 0;
  while ((m = FENCE_RE.exec(content))) {
    if (m.index > last) out.push({ kind: "md", text: content.slice(last, m.index) });
    const kind = m[1];
    const raw = m[2].trim();
    try {
      const json = JSON.parse(raw);
      out.push({ kind, data: json, raw });
    } catch {
      out.push({ kind: "md", text: "```" + kind + "\n" + raw + "\n```" });
    }
    last = FENCE_RE.lastIndex;
  }
  if (last < content.length) out.push({ kind: "md", text: content.slice(last) });
  return out;
}

function ChartBlock({ spec, data }) {
  return (
    <div className="chart-card mt-3">
      <ChartRenderer spec={spec} data={data} height={300} />
    </div>
  );
}

function textOf(node) {
  if (node === null || node === undefined) return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node.props?.children !== undefined) return textOf(node.props.children);
  return "";
}

const NUMERIC_CELL_RE = /^[−-]?\s?[\d\s\u00a0.,]+(\s?(%|₽|\$|€|млн|млрд|тыс\.?|km|км|м|kg|кг))?$/i;

function isNumericText(t) {
  return t !== "" && /\d/.test(t) && NUMERIC_CELL_RE.test(t);
}

function MarkdownTable({ children }) {
  const { columns, rows } = useMemo(
    () => parseMarkdownTableChildren(children),
    [children],
  );
  if (!columns.length) {
    return (
      <div className="markdown-table-wrap">
        <table>{children}</table>
      </div>
    );
  }
  return <InteractiveTable columns={columns} rows={rows} />;
}

const mdComponents = {
  table: ({ children }) => <MarkdownTable>{children}</MarkdownTable>,
  td: ({ children, ...props }) => (
    <td
      {...props}
      className={isNumericText(textOf(children).trim()) ? "is-num" : undefined}
    >
      {children}
    </td>
  ),
  th: ({ children, ...props }) => <th {...props}>{children}</th>,
};

function TableBlock({ spec }) {
  const rows = Array.isArray(spec.rows) ? spec.rows : [];
  const columns =
    Array.isArray(spec.columns) && spec.columns.length
      ? spec.columns
      : rows[0]
        ? Object.keys(rows[0]).map((k) => ({ key: k, label: k }))
        : [];

  return (
    <InteractiveTable
      title={spec.title}
      columns={columns}
      rows={rows}
    />
  );
}

function Suggestions({ items, onPick }) {
  if (!Array.isArray(items) || !items.length) return null;
  return (
    <div className="suggestions">
      <div className="suggestions-header">
        <span className="suggestions-rule" aria-hidden />
        <span className="suggestions-label">Follow-up</span>
        <span className="suggestions-rule" aria-hidden />
      </div>
      <div className="suggestions-list">
      {items.slice(0, 6).map((q, i) => (
        <button key={i} className="suggestion-chip" onClick={() => onPick?.(q)}>
          <span className="suggestion-chip__arrow" aria-hidden>→</span>
          <span className="suggestion-chip__text">{q}</span>
        </button>
      ))}
      </div>
    </div>
  );
}

function MessageContent({
  content,
  role,
  onSuggestionPick,
  citations,
}) {
  const blocks = useMemo(
    () => (role === "user" ? [] : parseBlocks(content || "")),
    [content, role],
  );
  if (role === "user") {
    return <div className="whitespace-pre-wrap">{content}</div>;
  }
  return (
    <div className="markdown-body">
      {blocks.map((b, i) => {
        if (b.kind === "md") {
          return (
            <ReactMarkdown
              key={i}
              remarkPlugins={[remarkGfm, remarkBreaks]}
              components={mdComponents}
            >
              {b.text}
            </ReactMarkdown>
          );
        }
        if (b.kind === "chart") {
          return (
            <ChartBlock
              key={i}
              spec={b.data}
              data={b.data?.data || []}
            />
          );
        }
        if (b.kind === "table") {
          return <TableBlock key={i} spec={b.data} />;
        }
        if (b.kind === "suggestions") {
          return <Suggestions key={i} items={b.data} onPick={onSuggestionPick} />;
        }
        return null;
      })}
      {role === "assistant" && <WebCitations citations={citations} />}
    </div>
  );
}

// Memoized: settled history messages don't re-render on every streaming delta.
export default memo(MessageContent);
