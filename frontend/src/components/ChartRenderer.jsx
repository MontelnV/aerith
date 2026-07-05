import { useEffect, useMemo, useRef, useState } from "react";
import ReactECharts from "echarts-for-react";
import { buildEchartsOption, getChartColors } from "../lib/buildEchartsOption";
import { normalizeChartSpec } from "../lib/chartSpec";

/**
 * Mount children only while the element is near the viewport.
 * Off-screen charts are replaced by a fixed-height placeholder, so long
 * chats don't keep dozens of live ECharts canvases in memory.
 */
function useNearViewport(margin = "600px") {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return undefined;
    }
    const obs = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: margin },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [margin]);
  return [ref, visible];
}

function useThemeWatch() {
  const read = () =>
    (typeof document !== "undefined" && document.documentElement.getAttribute("data-theme")) ||
    "dark";
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (typeof document === "undefined") return;
    const obs = new MutationObserver(() => setTick((n) => n + 1));
    obs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "data-module"],
    });
    return () => obs.disconnect();
  }, []);
  return tick;
}

export default function ChartRenderer({ spec, data, height = 260, zoom = false }) {
  const [hostRef, nearViewport] = useNearViewport();
  const themeTick = useThemeWatch();
  const rows = Array.isArray(data) ? data : [];
  const norm = useMemo(() => normalizeChartSpec(spec, rows), [spec, rows]);
  const colors = useMemo(() => getChartColors(norm), [norm, themeTick]);

  const option = useMemo(
    () => buildEchartsOption(norm, rows, colors, { zoom }),
    [norm, rows, colors, themeTick, zoom],
  );

  if (!rows.length || !norm.categories.length) {
    return (
      <div className="chart-root text-xs text-[var(--text-muted)] py-6 text-center">
        No data for chart
      </div>
    );
  }

  return (
    <div className="chart-root no-theme-transition w-full" ref={hostRef}>
      {norm.title && (
        <div className="text-sm font-semibold text-[var(--text-primary)] mb-0.5">{norm.title}</div>
      )}
      {norm.subtitle && (
        <div className="text-xs text-[var(--text-muted)] mb-2">{norm.subtitle}</div>
      )}
      <div className={norm.spark ? "chart-canvas chart-canvas--spark" : "chart-canvas"}>
        {nearViewport ? (
          <ReactECharts
            option={option}
            style={{ height, width: "100%" }}
            opts={{ renderer: "canvas" }}
            notMerge
            lazyUpdate
          />
        ) : (
          <div style={{ height, width: "100%" }} aria-hidden />
        )}
      </div>
    </div>
  );
}
