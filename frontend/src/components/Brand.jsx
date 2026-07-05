export default function Brand({ size = "md" }) {
  const sizes = {
    sm: "text-lg",
    md: "text-2xl",
    lg: "text-4xl",
    xl: "text-6xl",
  };
  return <span className={`brand-gradient ${sizes[size] || sizes.md}`}>AERITH</span>;
}
