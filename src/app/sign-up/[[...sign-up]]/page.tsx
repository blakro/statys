import { redirect } from "next/navigation";
import { SignUp } from "@clerk/nextjs";
import { clerkEnabled } from "@/lib/roles";

/** Création de compte Clerk (sur invitation d'une banque, en général). */
export default function SignUpPage() {
  if (!clerkEnabled) redirect("/login");
  return (
    <main className="flex min-h-screen items-center justify-center bg-navy-950 px-4 py-12">
      <SignUp />
    </main>
  );
}
