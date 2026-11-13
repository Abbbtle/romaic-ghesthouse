import Link from "next/link";
import { LogoSlot } from "@/components/ui/logo-slot";

/**
 * Sign-in, setup, the authenticator steps, passwords and emailed links: one
 * card on the canvas, the business name above it, and none of the
 * dashboard's navigation. The logo slot stays a marked placeholder until the
 * client's logo files arrive (the brand guide forbids retyping the wordmark).
 */
export default function AuthLayout({ children }: LayoutProps<"/admin">) {
  return (
    <main id="main" className="flex min-h-svh flex-col items-center justify-center bg-chalk px-4 py-10 text-fg">
      <div className="w-full max-w-100">
        <div className="mx-auto flex w-fit flex-col items-center gap-2 text-center">
          <Link href="/" className="rounded-sm p-1">
            <LogoSlot kind="wordmark" decorative />
            <span className="sr-only">Romaic Guesthouse website</span>
          </Link>
          <p className="text-xs text-fg-2">Dashboard</p>
        </div>
        <div className="mt-6 rounded-md border border-hairline bg-white p-6 sm:p-8">{children}</div>
      </div>
    </main>
  );
}
