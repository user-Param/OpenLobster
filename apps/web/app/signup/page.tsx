import { Suspense } from "react";
import type { Metadata } from "next";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthGateSpinner } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Create account" };

export default function SignUpPage() {
  return (
    <Suspense fallback={<AuthGateSpinner label="Loading" />}>
      <AuthForm mode="signup" />
    </Suspense>
  );
}
