import { Link } from "react-router-dom";
import { ArrowLeft, Hammer } from "lucide-react";
import { getModule } from "../modules/_config";
import { useModuleId } from "../hooks/useModuleBase";

export default function ComingSoonPage() {
  const moduleId = useModuleId();
  const module = getModule(moduleId);
  const Icon = module?.icon || Hammer;

  return (
    <main className="module-welcome flex h-full flex-1 min-w-0 items-center justify-center overflow-auto">
      <div className="mx-auto max-w-md px-6 py-10 text-center">
        <div
          className="module-welcome__icon mx-auto mb-5 flex items-center justify-center rounded-2xl border"
          aria-hidden
        >
          <Icon size={32} strokeWidth={1.75} />
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">
          {module?.label || "Module"}
        </h1>
        <p className="mx-auto mt-3 text-sm leading-relaxed text-muted">
          This workspace is under construction. New modules plug into AERITH
          through the module registry — see docs/INTEGRATION.md.
        </p>
        <Link to="/m/analytics" className="btn btn-ghost mt-8 gap-1.5 rounded-full text-sm">
          <ArrowLeft size={15} aria-hidden />
          Back to Analytics
        </Link>
      </div>
    </main>
  );
}
