import { useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { ArrowRight, MessageSquare } from "lucide-react";
import { createChat } from "../api/chats";
import { getModule } from "../modules/_config";
import { MODULE_WELCOME } from "../modules/welcomeContent";
import { useModuleBase, useModuleId } from "../hooks/useModuleBase";

export default function ModuleWelcomePage() {
  const moduleId = useModuleId();
  const moduleBase = useModuleBase();
  const navigate = useNavigate();
  const { refreshChats } = useOutletContext() || {};
  const module = getModule(moduleId);
  const welcome = MODULE_WELCOME[moduleId];
  const [starting, setStarting] = useState(false);

  if (!module || !welcome) {
    return (
      <div className="module-welcome flex h-full items-center justify-center text-muted">
        Module not found
      </div>
    );
  }

  const ModuleIcon = module.icon;

  const onStartChat = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const c = await createChat({ module_id: moduleId });
      await refreshChats?.();
      navigate(`${moduleBase}/chat/${c.id}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="module-welcome flex h-full min-h-0 flex-col overflow-auto scroll-invisible">
      <div className="module-welcome__inner mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 py-10">
        <header className="module-welcome__hero text-center">
          <div
            className="module-welcome__icon mx-auto mb-5 flex items-center justify-center rounded-2xl border"
            aria-hidden
          >
            <ModuleIcon size={32} strokeWidth={1.75} />
          </div>
          <h1 className="module-welcome__title text-2xl font-semibold tracking-tight">
            {welcome.headline}
          </h1>
          <p className="module-welcome__lead mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted">
            {welcome.lead}
          </p>
        </header>

        <ul className="module-welcome__features mt-10 grid gap-3 sm:grid-cols-2">
          {welcome.features.map((f) => {
            const FIcon = f.icon;
            return (
              <li key={f.title} className="panel module-welcome__card p-4">
                <div className="mb-2 flex items-center gap-2.5">
                  <span className="module-welcome__card-icon flex shrink-0 items-center justify-center rounded-lg">
                    <FIcon size={18} strokeWidth={2} aria-hidden />
                  </span>
                  <span className="text-sm font-medium">{f.title}</span>
                </div>
                <p className="text-sm leading-relaxed text-muted">{f.text}</p>
              </li>
            );
          })}
        </ul>

        <div className="module-welcome__actions mt-10 flex flex-col items-center gap-4">
          <button
            type="button"
            className="btn btn-primary module-welcome__cta gap-2 rounded-full px-6"
            onClick={onStartChat}
            disabled={starting}
          >
            <MessageSquare size={18} strokeWidth={2.25} aria-hidden />
            {starting ? "Creating chat…" : "Start conversation"}
          </button>

          {welcome.explore?.length ? (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <span className="w-full text-center text-xs text-muted sm:w-auto sm:mr-1">
                Or open
              </span>
              {welcome.explore.map((item) => {
                const EIcon = item.icon;
                return (
                  <Link
                    key={item.to}
                    to={`${moduleBase}/${item.to}`}
                    className="btn btn-ghost gap-1.5 rounded-full text-sm"
                  >
                    <EIcon size={15} aria-hidden />
                    {item.label}
                    <ArrowRight size={14} className="opacity-50" aria-hidden />
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
