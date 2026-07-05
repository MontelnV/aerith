import * as echarts from "echarts/core";
import {
  BarChart,
  CandlestickChart,
  LineChart,
  PieChart,
  ScatterChart,
} from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  ToolboxComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import {
  formatChartValue,
  getChartPalette,
  shouldRotateLabels,
} from "./chartSpec";

echarts.use([
  BarChart,
  CandlestickChart,
  LineChart,
  PieChart,
  ScatterChart,
  DataZoomComponent,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  ToolboxComponent,
  CanvasRenderer,
]);

function isNumericValue(v) {
  return typeof v === "number" && !Number.isNaN(v);
}

function readTheme() {
  if (typeof document === "undefined") {
    return {
      text: "#8c8c94",
      textStrong: "#c5c5cc",
      border: "rgba(63, 63, 70, 0.55)",
      tooltipBg: "rgba(12, 12, 14, 0.96)",
    };
  }
  const cs = getComputedStyle(document.documentElement);
  return {
    text: cs.getPropertyValue("--text-muted").trim() || "#8c8c94",
    textStrong: cs.getPropertyValue("--text-primary").trim() || "#c5c5cc",
    border: cs.getPropertyValue("--border-subtle").trim() || "rgba(63,63,70,0.55)",
    tooltipBg: cs.getPropertyValue("--bg-elevated").trim() || "rgba(12,12,14,0.96)",
  };
}

function rgba(hex, alpha) {
  const h = hex.replace("#", "");
  if (h.length !== 6) return `rgba(34, 211, 238, ${alpha})`;
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function seriesLabel(key, categoryLabels) {
  return categoryLabels[key] || key;
}

function baseGrid(spark, hasLegend) {
  if (spark) {
    return { left: 4, right: 4, top: 4, bottom: 4, containLabel: false };
  }
  return {
    left: 8,
    right: 12,
    top: hasLegend ? 36 : 16,
    bottom: 8,
    containLabel: true,
  };
}

function axisStyle(theme) {
  return {
    axisLine: { show: false },
    axisTick: { show: false },
    axisLabel: {
      color: theme.text,
      fontSize: 11,
      fontFamily: "Montserrat, system-ui, sans-serif",
    },
    splitLine: {
      lineStyle: { color: theme.border, type: "dashed" },
    },
  };
}

function makeTooltip(theme, show) {
  if (!show) return { show: false };
  return {
    trigger: "axis",
    backgroundColor: theme.tooltipBg,
    borderColor: theme.border,
    borderWidth: 1,
    padding: [10, 14],
    textStyle: {
      color: theme.textStrong,
      fontSize: 12,
      fontFamily: "Montserrat, system-ui, sans-serif",
    },
    axisPointer: {
      type: "cross",
      crossStyle: { color: theme.border },
      lineStyle: { color: theme.border, type: "dashed" },
    },
    valueFormatter: (v) => formatChartValue(v),
  };
}

function lineAreaSeries(kind, key, data, color, stacked, categoryLabels) {
  const values = data.map((row) => row[key]);
  const base = {
    name: seriesLabel(key, categoryLabels),
    type: "line",
    data: values,
    smooth: true,
    symbol: "circle",
    symbolSize: 6,
    showSymbol: data.length <= 24,
    lineStyle: { width: 2.5, color },
    itemStyle: { color, borderWidth: 2, borderColor: color },
    emphasis: {
      focus: "series",
      itemStyle: { shadowBlur: 12, shadowColor: rgba(color, 0.45) },
    },
    connectNulls: true,
    stack: stacked ? "total" : undefined,
  };

  if (kind === "area") {
    return {
      ...base,
      areaStyle: {
        color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
          { offset: 0, color: rgba(color, 0.38) },
          { offset: 1, color: rgba(color, 0.02) },
        ]),
      },
    };
  }
  return base;
}

export function buildEchartsOption(norm, rows, colors, opts = {}) {
  const theme = readTheme();
  const categories = norm.categories;
  const xData = rows.map((r) => String(r[norm.index] ?? ""));
  const rotate = shouldRotateLabels(rows, norm.index);
  const legendData = categories.map((k) => seriesLabel(k, norm.categoryLabels));

  if (norm.spark) {
    const key = categories[0];
    const color = colors[0];
    return {
      backgroundColor: "transparent",
      animation: true,
      grid: baseGrid(true, false),
      xAxis: { type: "category", show: false, data: xData },
      yAxis: { type: "value", show: false },
      series: [
        {
          type: "line",
          data: rows.map((r) => r[key]),
          smooth: true,
          symbol: "none",
          lineStyle: { width: 2, color },
          areaStyle: {
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: rgba(color, 0.35) },
              { offset: 1, color: rgba(color, 0) },
            ]),
          },
        },
      ],
    };
  }

  if (norm.kind === "candlestick") {
    const { open, high, low, close } = norm.ohlc || {};
    const cs = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
    const up = (cs && cs.getPropertyValue("--success").trim()) || colors[0] || "#34d399";
    const down = (cs && cs.getPropertyValue("--danger").trim()) || "#f43f5e";
    const candleData = rows.map((r) => [
      Number(r[open]),
      Number(r[close]),
      Number(r[low]),
      Number(r[high]),
    ]);
    const zoom = Boolean(opts.zoom);
    return {
      backgroundColor: "transparent",
      animation: true,
      grid: {
        ...baseGrid(false, false),
        bottom: zoom ? 56 : rotate ? 28 : 12,
        top: zoom ? 40 : 16,
      },
      ...(zoom
        ? {
            toolbox: {
              right: 8,
              top: 4,
              iconStyle: { borderColor: theme.text },
              emphasis: { iconStyle: { borderColor: theme.textStrong } },
              feature: {
                dataZoom: { yAxisIndex: false, title: { zoom: "Zoom", back: "Reset" } },
                restore: { title: "Restore" },
              },
            },
            dataZoom: [
              { type: "inside", xAxisIndex: 0, filterMode: "weakFilter" },
              {
                type: "slider",
                xAxisIndex: 0,
                height: 20,
                bottom: 6,
                borderColor: theme.border,
                fillerColor: rgba(colors[0] || "#e8b923", 0.15),
                handleStyle: { color: colors[0] || "#e8b923" },
                textStyle: { color: theme.text, fontSize: 10 },
              },
            ],
          }
        : {}),
      tooltip: {
        ...makeTooltip(theme, norm.showTooltip),
        trigger: "axis",
        axisPointer: { type: "cross" },
        formatter: (params) => {
          const p = params?.[0];
          if (!p) return "";
          const [o, c, l, h] = p.data || [];
          const label = p.axisValueLabel ?? p.name ?? "";
          return [
            `<strong>${label}</strong>`,
            `Open: ${formatChartValue(o)}`,
            `High: ${formatChartValue(h)}`,
            `Low: ${formatChartValue(l)}`,
            `Close: ${formatChartValue(c)}`,
          ].join("<br/>");
        },
      },
      xAxis: {
        type: "category",
        data: xData,
        show: norm.showXAxis,
        boundaryGap: true,
        ...axisStyle(theme),
        axisLabel: {
          ...axisStyle(theme).axisLabel,
          rotate: rotate ? 35 : 0,
          interval: rows.length > 20 ? "auto" : 0,
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        scale: true,
        show: norm.showYAxis,
        ...axisStyle(theme),
        axisLabel: {
          ...axisStyle(theme).axisLabel,
          formatter: (v) => formatChartValue(v),
        },
      },
      series: [
        {
          type: "candlestick",
          data: candleData,
          itemStyle: {
            color: up,
            color0: down,
            borderColor: up,
            borderColor0: down,
          },
        },
      ],
    };
  }

  if (norm.kind === "pie") {
    const valueKey = categories[0];
    return {
      backgroundColor: "transparent",
      animation: true,
      tooltip: {
        show: norm.showTooltip,
        trigger: "item",
        backgroundColor: theme.tooltipBg,
        borderColor: theme.border,
        borderWidth: 1,
        textStyle: { color: theme.textStrong, fontSize: 12 },
        valueFormatter: (v) => formatChartValue(v),
      },
      legend: norm.showLegend
        ? {
            bottom: 0,
            textStyle: { color: theme.text, fontSize: 11 },
            icon: "circle",
          }
        : { show: false },
      series: [
        {
          type: "pie",
          radius: ["42%", "68%"],
          center: ["50%", "46%"],
          avoidLabelOverlap: true,
          itemStyle: {
            borderRadius: 6,
            borderColor: theme.tooltipBg,
            borderWidth: 2,
          },
          label: { color: theme.text, fontSize: 11 },
          data: rows.map((row, i) => ({
            name: String(row[norm.index] ?? ""),
            value: row[valueKey],
            itemStyle: { color: colors[i % colors.length] },
          })),
        },
      ],
    };
  }

  if (norm.kind === "scatter") {
    const yKey = categories[0] || "y";
    const xIsNumeric = rows.length > 0 && isNumericValue(rows[0][norm.index]);
    return {
      backgroundColor: "transparent",
      animation: true,
      grid: baseGrid(false, norm.showLegend),
      tooltip: {
        ...makeTooltip(theme, norm.showTooltip),
        trigger: "item",
        formatter: (p) => {
          const [x, y] = p.data || [];
          return `${formatChartValue(x)} × ${formatChartValue(y)}`;
        },
      },
      legend: norm.showLegend
        ? { top: 0, textStyle: { color: theme.text, fontSize: 11 }, icon: "circle" }
        : { show: false },
      xAxis: {
        type: xIsNumeric ? "value" : "category",
        show: norm.showXAxis,
        ...axisStyle(theme),
        axisLabel: {
          ...axisStyle(theme).axisLabel,
          formatter: (v) => formatChartValue(v),
        },
        splitLine: { show: norm.showGridLines, lineStyle: { color: theme.border, type: "dashed" } },
      },
      yAxis: {
        type: "value",
        show: norm.showYAxis,
        ...axisStyle(theme),
        axisLabel: {
          ...axisStyle(theme).axisLabel,
          formatter: (v) => formatChartValue(v),
        },
      },
      series: [
        {
          name: seriesLabel(yKey, norm.categoryLabels),
          type: "scatter",
          data: rows.map((r) => [Number(r[norm.index]), Number(r[yKey])]),
          symbolSize: 12,
          itemStyle: {
            color: colors[0],
            opacity: 0.9,
            shadowBlur: 8,
            shadowColor: rgba(colors[0], 0.35),
          },
        },
      ],
    };
  }

  const isBar = norm.kind === "bar";
  const series = categories.map((key, i) => {
    const color = colors[i % colors.length];
    const values = rows.map((row) => row[key]);

    if (isBar) {
      return {
        name: seriesLabel(key, norm.categoryLabels),
        type: "bar",
        data: values,
        stack: norm.stacked ? "total" : undefined,
        barMaxWidth: 36,
        itemStyle: {
          color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
            { offset: 0, color: rgba(color, 0.95) },
            { offset: 1, color: rgba(color, 0.45) },
          ]),
          borderRadius: norm.stacked ? 0 : [6, 6, 0, 0],
        },
        emphasis: { focus: "series" },
      };
    }

    return lineAreaSeries(norm.kind, key, rows, color, norm.stacked, norm.categoryLabels);
  });

  return {
    backgroundColor: "transparent",
    animation: true,
    color: colors,
    grid: baseGrid(false, norm.showLegend && categories.length > 1),
    tooltip: makeTooltip(theme, norm.showTooltip),
    legend:
      norm.showLegend && categories.length > 1
        ? {
            top: 0,
            left: "center",
            textStyle: { color: theme.text, fontSize: 11 },
            icon: "roundRect",
            itemWidth: 12,
            itemHeight: 8,
            data: legendData,
          }
        : { show: false },
    xAxis: {
      type: "category",
      data: xData,
      show: norm.showXAxis,
      boundaryGap: isBar,
      ...axisStyle(theme),
      axisLabel: {
        ...axisStyle(theme).axisLabel,
        rotate: rotate ? 35 : 0,
        interval: rows.length > 16 ? "auto" : 0,
      },
      splitLine: { show: false },
    },
    yAxis: {
      type: "value",
      show: norm.showYAxis,
      ...axisStyle(theme),
      axisLabel: {
        ...axisStyle(theme).axisLabel,
        formatter: (v) => formatChartValue(v),
      },
    },
    series,
  };
}

export function getChartColors(norm) {
  return norm.colors?.length ? norm.colors : getChartPalette();
}
