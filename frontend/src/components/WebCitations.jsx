import { ExternalLink } from "lucide-react";

function displayUrl(url) {
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.replace(/\/$/, "");
  } catch {
    return url;
  }
}

export default function WebCitations({ citations }) {
  if (!Array.isArray(citations) || citations.length === 0) return null;

  return (
    <div className="web-citations mt-3 pt-3 border-t border-[var(--border-subtle)]">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-2">
        Web sources
      </div>
      <ul className="space-y-1">
        {citations.map((c, i) => {
          const url = c.url || "";
          const title = c.title || url;
          const blurb = (c.content || "").trim();
          return (
            <li key={url || i}>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="web-citation-link group block rounded-lg px-2 py-1.5 text-xs transition-colors hover:bg-[var(--accent-soft)]"
              >
                <span className="flex items-center gap-2 min-w-0">
                  <ExternalLink
                    size={12}
                    className="shrink-0 opacity-60 group-hover:opacity-100"
                    style={{ color: "var(--accent)" }}
                  />
                  <span className="min-w-0 flex-1 font-medium text-[var(--text-primary)] truncate">
                    {title}
                  </span>
                </span>
                {url ? (
                  <span
                    className="block pl-5 mt-0.5 truncate text-[var(--text-muted)] group-hover:text-[var(--accent)]"
                    title={url}
                  >
                    {displayUrl(url)}
                  </span>
                ) : null}
                {blurb ? (
                  <span className="block pl-5 mt-0.5 truncate text-[var(--text-muted)] opacity-80">
                    {blurb}
                  </span>
                ) : null}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
