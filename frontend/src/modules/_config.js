import {
  Gem,
  Orbit,
  Sparkles,
  Telescope,
  TrendingUp,
} from "lucide-react";

export const MODULES = [
  {
    id: "analytics",
    label: "Analytics",
    railLabel: "AERITH",
    short: "AN",
    icon: Telescope,
    accent: "#22d3ee",
    description: "Chat with AERITH over CSV / XLSX / database datasets",
    nav: [
      {
        to: "",
        label: "Chat",
        icon: Sparkles,
        matches: (rest) => rest === "" || rest === "chat" || rest.startsWith("chat/"),
      },
      { to: "datasets", label: "My datasets", icon: Orbit },
      { to: "marketplace", label: "Marketplace", icon: Gem },
    ],
  },
  {
    id: "markets",
    label: "Markets",
    railLabel: "MARKETS",
    short: "MK",
    icon: TrendingUp,
    accent: "#fbbf24",
    description: "Market data workspace — coming soon",
    comingSoon: true,
    nav: [],
  },
];

export const DEFAULT_MODULE_ID = "analytics";

export function getModule(id) {
  return MODULES.find((m) => m.id === id) || null;
}
