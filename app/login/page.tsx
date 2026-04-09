import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { AuthForm } from "@/components/auth-form";

export default async function LoginPage() {
  const session = await getAuthSession();

  if (session?.user?.id) {
    redirect("/");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-8 sm:px-6">
      <AuthForm mode="login" />
    </main>
  );
}
