import { IconSpark } from "./icons";

export function AiTag({ label = "AI" }: { label?: string }) {
  return (
    <span className="ai-tag">
      <IconSpark />
      {label}
    </span>
  );
}
