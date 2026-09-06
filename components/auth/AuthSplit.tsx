import { ThemeToggle } from '../theme/ThemeToggle';
import { TestimonialPanel } from './TestimonialPanel';

// Shared authentication shell: a 60% form column that blends into the page
// background and a 40% visual story hugging the right edge on larger screens.
// Below `lg` the visual is dropped entirely and the phone gets the form alone.
export function AuthSplit({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-paper min-h-svh overflow-x-hidden lg:py-2 lg:pr-2">
      <main className="grid min-h-svh w-full grid-cols-1 lg:min-h-[calc(100svh-16px)] lg:grid-cols-[60fr_40fr] lg:gap-2">
        <section className="flex min-h-svh flex-col px-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:px-10 lg:min-h-0 lg:px-12 lg:py-8 xl:px-16">
          <header className="flex items-center justify-end">
            <ThemeToggle compact />
          </header>

          <div className="flex flex-1 items-center py-12 sm:py-16 lg:py-10">
            <div className="mx-auto w-full max-w-[420px]">{children}</div>
          </div>
        </section>

        <TestimonialPanel />
      </main>
    </div>
  );
}
