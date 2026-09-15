import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await getSession();
  if (session) redirect("/dashboard");

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-primary px-4">
      {/* Motif lengkung — mengambil bentuk ekor huruf Q di logo */}
      <svg
        aria-hidden
        viewBox="0 0 800 800"
        className="pointer-events-none absolute -right-40 -top-40 h-[42rem] w-[42rem] opacity-[0.07]"
      >
        <g fill="none" stroke="#A1A692" strokeWidth="14" strokeLinecap="round">
          <path d="M120 420c80-60 200-60 280 0s200 60 280 0" />
          <path d="M120 500c80-60 200-60 280 0s200 60 280 0" />
          <path d="M120 580c80-60 200-60 280 0s200 60 280 0" />
          <circle cx="400" cy="230" r="150" />
        </g>
      </svg>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo.png"
            alt="Aqma Aesthetic Clinic"
            className="mb-4 h-20 w-20 rounded-2xl"
          />
          <h1 className="font-display text-4xl font-semibold tracking-[0.18em] text-white">
            AQMA
          </h1>
          <p className="label-caps mt-2 text-accent">Aesthetic Clinic</p>
        </div>

        <div className="rounded-[var(--radius-lg)] border border-white/10 bg-white p-6 shadow-lg">
          <p className="mb-4 text-sm text-muted-foreground">
            Masuk untuk melanjutkan.
          </p>
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-xs text-white/50">
          Aqma CRM — sistem internal klinik
        </p>
      </div>
    </div>
  );
}
