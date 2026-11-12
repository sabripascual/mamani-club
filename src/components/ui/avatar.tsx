import { cn } from "@/lib/utils";

const sizes = { sm: "size-9 text-xs", md: "size-12 text-sm", lg: "size-24 text-2xl" };

/** Avatar circular. Si no hay foto, muestra las iniciales sobre blush. */
export function Avatar({
  src,
  initials,
  size = "md",
  className,
}: {
  src?: string | null;
  initials: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-blush font-semibold text-graphite ring-2 ring-cream",
        sizes[size],
        className,
      )}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element -- URL firmada de Supabase, de vida corta
        <img src={src} alt="" className="size-full object-cover" />
      ) : (
        initials
      )}
    </span>
  );
}
