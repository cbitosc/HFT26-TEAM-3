import { cn } from '../utils/cn';

/**
 * The app frame: a fixed sidebar on desktop, a sticky topbar, a bottom tab bar on phones, and a centered content column.
 * Compose it from the kit's own pieces (or your own):
 *
 *   <AppShell sidebar={<Sidebar .../>} topbar={<Topbar .../>} mobileNav={<MobileNav .../>}>
 *     {page}
 *   </AppShell>
 *
 * `notice` renders above the page content (e.g. an <Alert>). The skip link lets keyboard users jump past the navigation.
 */
export default function AppShell({ sidebar, topbar, mobileNav, notice, children, className, contentClassName }) {
  return (
    <div className={cn('min-h-screen', className)}>
      <a href="#main" className="sr-only z-modal rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:fixed focus:left-4 focus:top-4">Skip to content</a>
      {sidebar}
      <div className={sidebar ? 'lg:pl-[calc(var(--w-sidebar)+0.75rem)]' : undefined}>
        {topbar}
        <main id="main" className={cn('mx-auto w-full max-w-content px-4 pb-28 pt-8 sm:px-6 lg:px-8 lg:pb-16 lg:pt-10', contentClassName)}>
          {notice}
          {children}
        </main>
      </div>
      {mobileNav}
    </div>
  );
}
