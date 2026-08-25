import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthGateSpinner } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <Suspense fallback={<AuthGateSpinner label="Loading" />}>
      <AuthForm mode="signin" />
    </Suspense>
  );
}
