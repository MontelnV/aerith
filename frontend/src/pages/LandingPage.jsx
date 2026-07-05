import { Link } from "react-router-dom";
import {
  ArrowRight,
  Database,
  KeyRound,
  MessageSquare,
  Shield,
  Workflow,
  Zap,
} from "lucide-react";
import Brand from "../components/Brand";

const FEATURES = [
  {
    icon: MessageSquare,
    title: "Talk like an analyst",
    text:
      "Ask questions in plain language — AERITH picks the right tools, explores your data, and replies with charts and tables.",
  },
  {
    icon: Workflow,
    title: "Agent swarm under the hood",
    text:
      "A lead planner breaks work into per-dataset subtasks and runs workers in parallel. You only see the final answer.",
  },
  {
    icon: Database,
    title: "Your data, your context",
    text:
      "CSV, XLSX, and PostgreSQL connections — all in one workspace and attachable to every chat.",
  },
  {
    icon: Zap,
    title: "Streaming replies",
    text:
      "Responses stream in the background: switch chats and the work keeps going until the result is ready.",
  },
  {
    icon: Shield,
    title: "Built for teams",
    text:
      "Invites, roles, and a shared dataset marketplace — set access for your team.",
  },
  {
    icon: KeyRound,
    title: "Your model, your keys",
    text:
      "Plug in any OpenAI-compatible API — OpenAI, OpenRouter, or local Ollama — and pick a different model for each chat.",
  },
];

const STEPS = [
  {
    num: "01",
    title: "Upload a dataset",
    text: "CSV, XLSX, or a PostgreSQL connection — in My datasets.",
  },
  {
    num: "02",
    title: "Describe the task in words",
    text: "AERITH decides what to compute, which charts to build, and what to highlight.",
  },
  {
    num: "03",
    title: "Refine and go deeper",
    text: "Keep the conversation going — AERITH rebuilds charts and tables as you clarify.",
  },
];

export default function LandingPage() {
  return (
    <div className="landing flex-1 min-w-0 h-full overflow-auto scroll-invisible">
      <div className="landing__inner mx-auto max-w-6xl px-6 pb-16 pt-14">
        <section className="landing-hero relative">
          <h1 className="landing-hero__title">
            <Brand size="xl" />
          </h1>
          <p className="landing-hero__lead">
            An analytics tool where your data talks back.
            Upload datasets, ask questions — and get ready-made
            charts, tables, and insights.
          </p>
          <div className="landing-hero__ctas">
            <Link to="/m/analytics" className="btn btn-primary landing-cta">
              Get started
              <ArrowRight size={16} />
            </Link>
            <Link to="/m/analytics/datasets" className="btn landing-cta">
              <Database size={15} />
              My datasets
            </Link>
          </div>
          <div className="landing-hero__orbs" aria-hidden>
            <span className="landing-orb landing-orb--a" />
            <span className="landing-orb landing-orb--b" />
            <span className="landing-orb landing-orb--c" />
          </div>
        </section>

        <section className="mt-16">
          <div className="landing-section-header">
            <span className="landing-section-kicker">Features</span>
            <h2 className="landing-section-title">What AERITH can do</h2>
          </div>
          <div className="landing-features">
            {FEATURES.map((f) => {
              const Icon = f.icon;
              return (
                <div key={f.title} className="landing-feature">
                  <div className="landing-feature__icon" aria-hidden>
                    <Icon size={18} strokeWidth={1.9} />
                  </div>
                  <div className="landing-feature__title">{f.title}</div>
                  <div className="landing-feature__text">{f.text}</div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="mt-16">
          <div className="landing-section-header">
            <span className="landing-section-kicker">Three steps</span>
            <h2 className="landing-section-title">How it works</h2>
          </div>
          <div className="landing-steps">
            {STEPS.map((s) => (
              <div key={s.num} className="landing-step">
                <div className="landing-step__num">{s.num}</div>
                <div className="landing-step__title">{s.title}</div>
                <div className="landing-step__text">{s.text}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <div className="landing-final">
            <div className="landing-final__left">
              <h2 className="landing-section-title" style={{ marginBottom: 8 }}>
                Ready to ask?
              </h2>
              <p className="landing-section-sub" style={{ maxWidth: 520 }}>
                Start with a short question. AERITH will figure out which
                tools to use and how to shape the answer.
              </p>
            </div>
            <Link to="/m/analytics" className="btn btn-primary landing-cta">
              Open chat
              <ArrowRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
