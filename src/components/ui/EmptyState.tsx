import { CircleHelp } from "lucide-react";

export function EmptyState({
  title,
  description,
}: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <section className="site-empty-state" role="status" aria-live="polite">
      <span className="site-empty-state__icon" aria-hidden="true">
        <CircleHelp size={24} strokeWidth={1.5} />
      </span>
      <h2>{title}</h2>
      <p>{description}</p>
    </section>
  );
}
