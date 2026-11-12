export default function Home() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-16">
      <p className="text-sm font-semibold uppercase tracking-[0.25em] text-rose">Bienvenidas</p>
      <h1 className="mt-3 font-display text-5xl leading-[1.05] font-semibold">
        MAMANÍ
        <br />
        CLUB
      </h1>
      <p className="mt-4 text-lg text-graphite/75">La cuenta de nuestras juntadas.</p>

      <div className="mt-10 rounded-[var(--radius-card)] bg-blush/60 p-6">
        <p className="font-display text-xl">Estamos preparando el club.</p>
        <p className="mt-2 text-sm text-graphite/70">
          Muy pronto vas a poder crear tu cuenta y pedir acceso al grupo.
        </p>
      </div>
    </main>
  );
}
