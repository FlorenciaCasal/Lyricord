"use client";

import { useRouter } from "next/navigation";

type BackButtonProps = {
  fallbackHref: string;
  children: React.ReactNode;
  className?: string;
};

export function BackButton({
  fallbackHref,
  children,
  className,
}: BackButtonProps) {
  const router = useRouter();

  function handleClick() {
    if (window.history.length > 1) {
      router.back();
      return;
    }

    router.push(fallbackHref);
  }

  return (
    <button type="button" onClick={handleClick} className={className}>
      {children}
    </button>
  );
}
