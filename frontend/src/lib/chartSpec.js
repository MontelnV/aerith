function isNumericValue(v) {
  return typeof v === "number" && !Number.isNaN(v);
}

function pickIndexKey(spec, rows) {
  const s = spec || {};
  if (s.index) return s.index;
  if (s.xKey) return s.xKey;
  if (s.x_key) return s.x_key;
  if (s.x) return s.x;
  if (rows[0]) {
    const keys = Object.keys(rows[0]);
    const preferred = keys.find((k) => /date|label|name|period|month|year|time/i.test(k));
    return preferred || keys[0] || "x";
  }
  return "x";
}

function pickCategories(spec, rows, indexKey) {
  const s = spec || {};
  const out = [];
  const labels = {};

  if (Array.isArray(s.series) && s.series.length) {
    for (const k of s.series) {
      if (typeof k === "string" && k) out.push(k);
    }
  } else if (Array.isArray(s.yKeys) && s.yKeys.length) {
    for (const k of s.yKeys) {
      if (typeof k === "string" && k) out.push(k);
    }
  } else if (Array.isArray(s.y) && s.y.length) {
    for (const item of s.y) {
      if (typeof item === "string" && item) out.push(item);
      else if (item && typeof item === "object" && item.key) {
        out.push(item.key);
        if (item.label) labels[item.key] = item.label;
      }
    }
  }

  if (!out.length && rows[0]) {
    const numeric = Object.keys(rows[0]).filter(
      (k) => k !== indexKey && isNumericValue(rows[0][k]),
    );
    if (numeric.length >= 1 && numeric.length <= 3) {
      return { categories: numeric, categoryLabels: labels };
    }
  }

  return { categories: out, categoryLabels: labels };
}

const OHLC_KINDS = new Set(["candlestick", "ohlc", "candles"]);

export function normalizeChartSpec(spec, data) {
  const s = spec || {};
  const rows = Array.isArray(data) ? data : [];
  const index = pickIndexKey(s, rows);
  let kind = String(s.kind || "bar").toLowerCase();
  if (OHLC_KINDS.has(kind)) kind = "candlestick";

  if (kind === "candlestick") {
    const ohlc = {
      open: s.openKey || s.open_key || "open",
      high: s.highKey || s.high_key || "high",
      low: s.lowKey || s.low_key || "low",
      close: s.closeKey || s.close_key || "close",
    };
    const hideAxes = !!s.hideAxes;
    const hideGrid = !!s.hideGrid;
    const hideLegend = !!s.hideLegend;
    const spark = !!(s.spark || (s.hideAxes && s.hideLegend));
    return {
      kind: "candlestick",
      index,
      categories: ["ohlc"],
      categoryLabels: {},
      ohlc,
      title: s.title || null,
      subtitle: s.subtitle || null,
      stacked: false,
      colors: Array.isArray(s.colors) && s.colors.length ? s.colors : null,
      spark,
      showXAxis: hideAxes ? false : s.showXAxis !== false,
      showYAxis: hideAxes ? false : s.showYAxis !== false,
      showLegend: false,
      showGridLines: hideGrid || spark ? false : s.showGridLines !== false,
      showTooltip: spark ? false : s.showTooltip !== false,
    };
  }

  const { categories, categoryLabels } = pickCategories(s, rows, index);
  const spark = !!(s.spark || (s.hideAxes && s.hideLegend));

  const hideAxes = !!s.hideAxes;
  const hideGrid = !!s.hideGrid;
  const hideLegend = !!s.hideLegend;

  return {
    kind,
    index,
    categories,
    categoryLabels,
    title: s.title || null,
    subtitle: s.subtitle || null,
    stacked: !!s.stacked,
    colors: Array.isArray(s.colors) && s.colors.length ? s.colors : null,
    spark,
    showXAxis: hideAxes ? false : s.showXAxis !== false,
    showYAxis: hideAxes ? false : s.showYAxis !== false,
    showLegend: hideLegend || spark ? false : s.showLegend !== false,
    showGridLines: hideGrid || spark ? false : s.showGridLines !== false,
    showTooltip: spark ? false : s.showTooltip !== false,
  };
}

export function formatChartValue(value) {
  if (value == null || Number.isNaN(value)) return "—";
  const n = Number(value);
  const abs = Math.abs(n);
  if (abs >= 1e12) return `${(n / 1e12).toLocaleString("en-US", { maximumFractionDigits: 1 })}T`;
  if (abs >= 1e9) return `${(n / 1e9).toLocaleString("en-US", { maximumFractionDigits: 1 })}B`;
  if (abs >= 1e6) return `${(n / 1e6).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1e4) return `${(n / 1e3).toLocaleString("en-US", { maximumFractionDigits: 1 })}K`;
  if (Number.isInteger(n)) return n.toLocaleString("en-US");
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function hexToRgb(hex) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixHex(hex, pct, towardWhite) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  const t = towardWhite ? 255 : 0;
  const f = pct / 100;
  const r = Math.round(rgb.r + (t - rgb.r) * f);
  const g = Math.round(rgb.g + (t - rgb.g) * f);
  const b = Math.round(rgb.b + (t - rgb.b) * f);
  return `#${[r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

export function getChartPalette() {
  if (typeof document === "undefined") {
    return ["#22d3ee", "#06b6d4", "#0891b2", "#67e8f9"];
  }
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#22d3ee";
  const base = accent.startsWith("#") ? accent : "#22d3ee";
  return [
    base,
    mixHex(base, 22, true),
    mixHex(base, 35, false),
    mixHex(base, 55, true),
  ];
}

export function shouldRotateLabels(rows, indexKey) {
  if (!rows.length) return false;
  const sample = rows.slice(0, 8).map((r) => String(r[indexKey] ?? ""));
  const avgLen = sample.reduce((a, s) => a + s.length, 0) / sample.length;
  return avgLen > 8 || rows.length > 10;
}
