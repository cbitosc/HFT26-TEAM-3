import { Search } from 'lucide-react';
import { cn } from '../utils/cn';
import Breadcrumb from '../components/Breadcrumb';
import IconButton from '../components/IconButton';
import Brand from './Brand';

/**
 * Sticky top bar. `breadcrumbs` is [{ label, to? }]. `onSearch` shows the search box (wire it to the command palette).
 * `right` is any node (theme switcher, notifications, avatar menu...). The brand shows below `lg`, where the sidebar is hidden.
 */
export default function Topbar({ brand, breadcrumbs, onSearch, searchPlaceholder = 'Search or jump to…', right, className }) {
  const isMac = typeof navigator !== 'undefined' && /mac/i.test(navigator.platform);
  return (
    <header className={cn('sticky top-3 z-nav mx-4 mt-3 flex h-14 items-center gap-3 rounded-2xl border border-line bg-surface/90 px-4 shadow-sm backdrop-blur sm:mx-6 lg:mx-8', className)}>
      <div className="lg:hidden">{brand ?? <Brand />}</div>
      {breadcrumbs && <Breadcrumb items={breadcrumbs} className="hidden lg:block" />}
      <div className="ml-auto flex items-center gap-1.5">
        {onSearch && (
          <>
            <button type="button" onClick={onSearch} aria-label="Open command palette"
              className="hidden h-9 w-64 items-center gap-2 rounded-full border border-line bg-surface-2 px-3.5 text-fg-3 transition hover:border-fg-3/50 hover:text-fg-2 md:flex">
              <Search className="h-3.5 w-3.5" aria-hidden />
              <span className="t-small flex-1 text-left">{searchPlaceholder}</span>
              <kbd className="t-mono rounded-sm border border-line px-1 text-[0.6875rem]">{isMac ? '⌘' : 'Ctrl'} K</kbd>
            </button>
            <IconButton icon={Search} label="Search" onClick={onSearch} className="md:hidden" />
          </>
        )}
        {right}
      </div>
    </header>
  );
}
