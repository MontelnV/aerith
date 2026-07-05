import {
  Database,
  Gem,
  LineChart,
  MessageSquare,
  Orbit,
  Workflow,
} from "lucide-react";

export const MODULE_WELCOME = {
  analytics: {
    headline: "Analytics",
    lead:
      "Talk to AERITH over your tables and database connections. Upload datasets, switch to analytics mode — agents will build charts and summaries in the reply.",
    features: [
      {
        icon: MessageSquare,
        title: "Chat with data",
        text: "Ask questions in plain language — get answers with tables and charts.",
      },
      {
        icon: Workflow,
        title: "Agent swarm",
        text: "Complex requests are split into subtasks and run in parallel.",
      },
      {
        icon: Database,
        title: "Datasets",
        text: "CSV, XLSX, and PostgreSQL connections — context for every chat.",
      },
      {
        icon: LineChart,
        title: "Visualizations",
        text: "Bar, line, pie, and candlestick charts right in messages.",
      },
    ],
    explore: [
      { to: "datasets", label: "My datasets", icon: Orbit },
      { to: "marketplace", label: "Marketplace", icon: Gem },
    ],
  },
};
