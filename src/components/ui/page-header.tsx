export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="mb-6">
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-dark">{eyebrow}</p>
      )}
      <h1 className="mt-1 font-display text-[2rem] leading-tight font-semibold">{title}</h1>
      {children && <div className="mt-2 text-graphite/65">{children}</div>}
    </header>
  );
}
