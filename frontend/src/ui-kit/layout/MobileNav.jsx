import { cn } from '../utils/cn';
import { Link } from '../utils/link';

/** Bottom tab bar for screens below `lg`. Same item shape as <Sidebar>; only items with `mobile: true` are shown (all, if none are flagged). */
export default function MobileNav({ items = [], activePath = '', className }) {
  const shown = items.some((n) => n.mobile) ? items.filter((n) => n.mobile) : items;
  return (
    <nav aria-label="Primary" className={cn('pb-safe fixed inset-x-0 bottom-0 z-nav border-t border-line bg-bg/95 backdrop-blur lg:hidden', className)}>
      <ul className="mx-auto grid max-w-lg" style={{ gridTemplateColumns: `repeat(${shown.length}, minmax(0, 1fr))` }}>
        {shown.map((item) => {
          const active = item.end ? activePath === item.to : activePath === item.to || activePath.startsWith(`${item.to}/`);
          const Icon = item.icon;
          return (
            <li key={item.id}>
              <Link to={item.to} aria-current={active ? 'page' : undefined}
                className={cn('relative flex h-14 flex-col items-center justify-center gap-1 text-[0.6875rem] font-medium transition-colors hover:no-underline', active ? 'text-accent-text' : 'text-fg-3')}>
                {Icon && <Icon className="h-5 w-5" aria-hidden />}
                {item.shortLabel || item.label}
                {item.badge > 0 && <span className="absolute right-[26%] top-2 h-2 w-2 rounded-full bg-danger" aria-label={`${item.badge} pending`} />}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
