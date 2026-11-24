import Image, { type StaticImageData } from "next/image";
import Link from "next/link";
import appIcon from "@/app/icon.png";
import onboardingImport from "@/mobile/assets/musum_onboarding_1.png";
import onboardingFollow from "@/mobile/assets/musum_onboarding_2.png";
import onboardingLibrary from "@/mobile/assets/musum_onboarding_3.png";
import {
  LANDING_FEATURES,
  STORE_LISTINGS,
  getPublicStoreUrl,
} from "@/lib/public-landing";

const onboardingArtwork: readonly {
  id: string;
  image: StaticImageData;
}[] = [
  { id: "import", image: onboardingImport },
  { id: "follow", image: onboardingFollow },
  { id: "library", image: onboardingLibrary },
];

function StoreAvailability() {
  return (
    <div
      aria-label="Disponibilidad de Musum en tiendas"
      className="grid w-full gap-3 sm:max-w-xl sm:grid-cols-2"
    >
      {STORE_LISTINGS.map((listing) => {
        const href = getPublicStoreUrl(listing);
        const content = (
          <>
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-400">
              {listing.eyebrow}
            </span>
            <span className="mt-1 text-base font-semibold text-white">
              {listing.name}
            </span>
            <span className="mt-1 text-xs font-medium text-green-400">
              {listing.available ? "Descargar" : "Próximamente"}
            </span>
          </>
        );

        if (href) {
          return (
            <a
              key={listing.id}
              href={href}
              className="flex min-h-20 flex-col justify-center rounded-2xl border border-green-400/35 bg-green-400/10 px-5 py-3 outline-none hover:border-green-400/60 hover:bg-green-400/15 focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              rel="noreferrer"
            >
              {content}
            </a>
          );
        }

        return (
          <div
            key={listing.id}
            aria-label={`${listing.name}: próximamente`}
            className="flex min-h-20 cursor-default flex-col justify-center rounded-2xl border border-slate-700 bg-slate-900/75 px-5 py-3"
          >
            {content}
          </div>
        );
      })}
    </div>
  );
}

function ArtworkStrip() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto grid w-full min-w-0 max-w-2xl grid-cols-3 items-end gap-2 sm:gap-4 lg:max-w-none"
    >
      <div className="pointer-events-none absolute inset-x-[12%] bottom-[5%] top-[8%] rounded-full bg-green-400/15 blur-3xl" />
      {onboardingArtwork.map((artwork, index) => (
        <div
          key={artwork.id}
          className={`relative aspect-[4/5] overflow-hidden rounded-[1.5rem] border border-white/10 bg-black shadow-2xl shadow-black/50 sm:rounded-[2rem] ${
            index === 1
              ? "z-10 -translate-y-4"
              : index === 0
                ? "rotate-[-2deg]"
                : "rotate-[2deg]"
          }`}
        >
          <Image
            src={artwork.image}
            alt=""
            fill
            priority={index === 1}
            sizes="(max-width: 640px) 31vw, (max-width: 1024px) 30vw, 190px"
            className="scale-[1.15] object-cover object-[center_20%]"
          />
          <div className="absolute inset-x-0 bottom-0 h-1/2 bg-[linear-gradient(to_bottom,transparent_0%,#000_22%,#000_100%)]" />
        </div>
      ))}
    </div>
  );
}

export function PublicLanding() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[42rem] bg-[radial-gradient(circle_at_65%_12%,rgba(132,204,22,0.16),transparent_38%)]" />

      <header className="relative z-20 mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <Link
          href="/"
          aria-label="Musum, inicio"
          className="inline-flex items-center gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          <Image
            src={appIcon}
            alt=""
            width={42}
            height={42}
            className="rounded-[0.8rem]"
            priority
          />
          <span className="text-xl font-semibold tracking-[-0.04em]">Musum</span>
        </Link>

        <Link
          href="/login"
          className="inline-flex min-h-11 items-center justify-center rounded-full px-4 text-sm font-semibold text-slate-200 outline-none hover:bg-white/5 hover:text-white focus-visible:ring-2 focus-visible:ring-green-400 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
        >
          Iniciar sesión
        </Link>
      </header>

      <section className="relative mx-auto grid w-full max-w-7xl gap-14 px-5 pb-20 pt-10 sm:px-8 sm:pb-28 sm:pt-16 lg:grid-cols-[minmax(0,1.02fr)_minmax(28rem,0.98fr)] lg:items-center lg:gap-16 lg:px-10 lg:pb-32 lg:pt-20">
        <div className="min-w-0 max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-green-400">
            Tu cancionero personal
          </p>
          <h1 className="mt-5 text-balance text-5xl font-semibold leading-[0.98] tracking-[-0.055em] text-white sm:text-6xl lg:text-7xl">
            Tus canciones, siempre con vos.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-lg leading-8 text-slate-300 sm:text-xl sm:leading-9">
            Tu cancionero personal de letras y acordes. Guardá las canciones que
            te gustan y tenelas listas para cuando quieras tocar.
          </p>

          <div className="mt-9">
            <StoreAvailability />
          </div>
        </div>

        <ArtworkStrip />
      </section>

      <section
        aria-labelledby="features-title"
        className="relative border-y border-white/10 bg-slate-900/55"
      >
        <div className="mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-24 lg:px-10">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-green-400">
              Hecho para tocar
            </p>
            <h2
              id="features-title"
              className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl"
            >
              De una canción que descubrís a un repertorio propio.
            </h2>
          </div>

          <div className="mt-14 grid gap-10 md:grid-cols-3 md:gap-0">
            {LANDING_FEATURES.map((feature, index) => (
              <article
                key={feature.title}
                className="md:min-h-56 md:border-l md:border-white/10 md:px-8 md:first:border-l-0 md:first:pl-0 md:last:pr-0"
              >
                <span className="text-sm font-semibold tabular-nums text-green-400">
                  0{index + 1}
                </span>
                <h3 className="mt-5 text-2xl font-semibold tracking-[-0.03em] text-white">
                  {feature.title}
                </h3>
                <p className="mt-4 text-base leading-7 text-slate-300">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="relative mx-auto w-full max-w-7xl px-5 py-20 sm:px-8 sm:py-28 lg:px-10">
        <div className="flex flex-col gap-10 rounded-[2rem] border border-green-400/20 bg-[linear-gradient(135deg,rgba(132,204,22,0.12),rgba(15,23,42,0.78))] px-6 py-10 sm:px-10 sm:py-12 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-[-0.04em] text-white sm:text-4xl">
              Tu repertorio va con vos.
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-300 sm:text-lg">
              Musum llegará próximamente a App Store y Google Play. Si ya tenés
              una cuenta, podés seguir entrando a tu biblioteca web.
            </p>
          </div>
          <div className="w-full lg:max-w-xl">
            <StoreAvailability />
            <p className="mt-4 text-center text-sm text-slate-400 lg:text-left">
              ¿Ya tenés cuenta?{" "}
              <Link
                href="/login"
                className="font-semibold text-slate-200 underline decoration-slate-600 underline-offset-4 outline-none hover:text-white focus-visible:rounded focus-visible:ring-2 focus-visible:ring-green-400"
              >
                Iniciar sesión
              </Link>
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-8 text-sm text-slate-400 sm:px-8 md:flex-row md:items-center md:justify-between lg:px-10">
          <p>© {new Date().getFullYear()} Musum</p>
          <nav
            aria-label="Información y ayuda"
            className="flex flex-wrap gap-x-6 gap-y-3"
          >
            <Link href="/support" className="hover:text-white">
              Soporte
            </Link>
            <Link href="/terms" className="hover:text-white">
              Términos de uso
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacidad
            </Link>
            <Link href="/copyright" className="hover:text-white">
              Copyright
            </Link>
          </nav>
        </div>
      </footer>
    </main>
  );
}
