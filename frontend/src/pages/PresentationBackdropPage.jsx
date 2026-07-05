import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";

export default function PresentationBackdropPage() {
  const [params] = useSearchParams();

  useEffect(() => {
    const t = params.get("theme");
    if (t === "light" || t === "dark") {
      document.documentElement.setAttribute("data-theme", t);
    }
    document.title = "AERITH — backdrop";
    return () => {
      document.documentElement.setAttribute("data-theme", "dark");
      document.title = "AERITH";
    };
  }, [params]);

  return <div className="presentation-backdrop-page" aria-hidden="true" />;
}
