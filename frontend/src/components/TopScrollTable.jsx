import { useCallback, useEffect, useRef, useState } from "react";

/** Wide table with a synced horizontal scrollbar above the content. */
export default function TopScrollTable({ children }) {
  const topRef = useRef(null);
  const bodyRef = useRef(null);
  const measureRef = useRef(null);
  const syncing = useRef(false);
  const [showBar, setShowBar] = useState(false);

  const syncWidths = useCallback(() => {
    const body = bodyRef.current;
    const top = topRef.current;
    const measure = measureRef.current;
    if (!body || !top || !measure) return;
    const w = measure.scrollWidth;
    const spacer = top.firstElementChild;
    if (spacer) spacer.style.width = `${w}px`;
    setShowBar(w > body.clientWidth + 1);
  }, []);

  useEffect(() => {
    syncWidths();
    const ro = new ResizeObserver(syncWidths);
    if (measureRef.current) ro.observe(measureRef.current);
    if (bodyRef.current) ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, [children, syncWidths]);

  const syncFromTop = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (bodyRef.current && topRef.current) {
      bodyRef.current.scrollLeft = topRef.current.scrollLeft;
    }
    syncing.current = false;
  };

  const syncFromBody = () => {
    if (syncing.current) return;
    syncing.current = true;
    if (bodyRef.current && topRef.current) {
      topRef.current.scrollLeft = bodyRef.current.scrollLeft;
    }
    syncing.current = false;
  };

  return (
    <div className="table-scroll-top">
      <div
        ref={topRef}
        className={`table-scroll-top__bar${showBar ? "" : " is-hidden"}`}
        onScroll={syncFromTop}
        aria-hidden={!showBar}
      >
        <div className="table-scroll-top__spacer" />
      </div>
      <div
        ref={bodyRef}
        className="markdown-table-wrap table-scroll-top__body"
        onScroll={syncFromBody}
      >
        <div ref={measureRef} className="table-scroll-top__measure">
          {children}
        </div>
      </div>
    </div>
  );
}
