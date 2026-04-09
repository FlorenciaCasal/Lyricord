import Link from "next/link";

type EmptyStateProps = {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
};

export function EmptyState({
  title,
  description,
  actionLabel,
  actionHref,
}: EmptyStateProps) {
  return (
    <section className="rounded-[2rem] border border-dashed border-slate-700 bg-slate-900 p-8 text-center shadow-sm shadow-black/20">
      <h2 className="font-heading text-3xl text-white">{title}</h2>
      <p className="mx-auto mt-3 max-w-xl text-base text-slate-300">
        {description}
      </p>
      <Link
        href={actionHref}
        className="mt-6 inline-flex items-center justify-center rounded-full bg-green-500 px-5 py-3 text-sm font-semibold text-black transition hover:bg-green-400"
      >
        {actionLabel}
      </Link>
    </section>
  );
}
