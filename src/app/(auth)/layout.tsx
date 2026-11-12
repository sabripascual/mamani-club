import { Wordmark } from "@/components/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-dvh overflow-hidden">
      {/* Manchas de color suaves de fondo */}
      <div aria-hidden className="pointer-events-none absolute -top-32 -right-24 size-80 rounded-full bg-rose/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-40 -left-24 size-80 rounded-full bg-lime/50 blur-3xl" />
      <main className="relative mx-auto flex min-h-dvh max-w-md flex-col px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-12">
        <Wordmark className="w-44" priority />
        <div className="flex flex-1 flex-col justify-center py-10">{children}</div>
      </main>
    </div>
  );
}
