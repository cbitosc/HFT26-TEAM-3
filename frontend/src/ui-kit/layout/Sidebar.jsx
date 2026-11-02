import { cn } from '../utils/cn';
import { Link } from '../utils/link';
import Avatar from '../components/Avatar';
import Brand from './Brand';

const isActive = (item, path) => (item.end ? path === item.to : path === item.to || path.startsWith(`${item.to}/`));

/**
 * Desktop sidebar (shown from the `lg` breakpoint). Router-agnostic: pass the current path as `activePath`.
 *
 * items: [{ id, label, to, icon, group?, end?, badge? }]  (badge: number, shown when > 0)
 * actions: node rendered under the brand (e.g. a primary "New" button)
 * user: { name, subtitle } shows an avatar footer; onSignOut adds a sign-out button; footer: any extra node.
 */
export default function Sidebar({ brand, items = [], activePath = '', actions, user, onSignOut, signOutIcon: SignOutIcon, footer, className }) {
  const groups = [...new Set(items.map((n) => n.group || ''))];
  return (
    <aside className={cn('fixed inset-y-3 left-3 z-nav hidden w-[var(--w-sidebar)] flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface shadow-sm lg:flex', className)}>
      <div className="flex h-[var(--h-topbar)] items-center px-5">{brand ?? <Brand />}</div>
      {actions && <div className="flex gap-2 px-3 pb-2 pt-1">{actions}</div>}
      <nav aria-label="Primary" className="flex-1 overflow-y-auto px-3 py-3">
        {groups.map((group) => (
          <div key={group || 'main'} className={group ? 'mt-5' : ''}>
            {group && <p className="t-eyebrow mb-1.5 px-3 text-fg-3">{group}</p>}
            <ul className="space-y-0.5">
              {items.filter((n) => (n.group || '') === group).map((item) => {
                const active = isActive(item, activePath);
                const Icon = item.icon;
                return (
                  <li key={item.id}>
                    <Link to={item.to} aria-current={active ? 'page' : undefined}
                      className={cn('group relative flex h-10 items-center gap-3 rounded-xl px-3 text-[0.875rem] font-medium transition-colors hover:no-underline',
                        active ? 'bg-accent/10 font-semibold text-accent-text' : 'text-fg-2 hover:bg-surface-2 hover:text-fg')}>
                      {active && <span className="absolute -left-3 top-2.5 h-5 w-1 rounded-full bg-accent" aria-hidden />}
                      {Icon && <Icon className={cn('h-4 w-4', active ? 'text-accent-text' : 'text-fg-3 group-hover:text-fg-2')} aria-hidden />}
                      <span className="flex-1">{item.label}</span>
                      {item.badge > 0 && <span className="rounded-full bg-danger/15 px-1.5 text-[0.6875rem] font-semibold text-danger" aria-label={`${item.badge} pending`}>{item.badge}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      {(user || footer) && (
        <div className="border-t border-line p-4">
          {user && (
            <div className="mb-3 flex items-center gap-2.5">
              <Avatar name={user.name} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-fg">{user.name}</p>
                {user.subtitle && <p className="truncate text-[12px] text-fg-3">{user.subtitle}</p>}
              </div>
              {onSignOut && (
                <button type="button" onClick={onSignOut} aria-label="Sign out" title="Sign out" className="rounded-md p-1.5 text-fg-3 transition hover:bg-surface-2 hover:text-fg">
                  {SignOutIcon ? <SignOutIcon className="h-4 w-4" aria-hidden /> : 'Sign out'}
                </button>
              )}
            </div>
          )}
          {footer}
        </div>
      )}
    </aside>
  );
}
