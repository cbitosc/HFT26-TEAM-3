/**
 * Marketing-page building blocks in the kit's themes: nav, hero, feature cards, steps, comparison, pricing, FAQ, CTA band, footer,
 * a browser-style window for product mockups, and <LandingPage> which assembles them from one config object.
 * Every block is props-driven and themed by tokens, so a theme or accent change re-skins the whole page.
 */
import { useId, useState } from 'react';
import { Check, Menu, Minus, Plus, X } from 'lucide-react';
import { Badge } from '../components/Badge';
import Button from '../components/Button';
import { Link } from '../utils/link';
import { cn } from '../utils/cn';
import Brand from '../layout/Brand';

const container = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8';

/** Wraps words of a headline in the accent gradient: <GradientText>built for engineers</GradientText>. */
export const GradientText = ({ children }) => <span className="text-gradient">{children}</span>;

/** Sticky top navigation with a collapsible menu on phones. links: [{ label, href }]  actions: node (buttons). */
export function LandingNav({ brand, links = [], actions, className }) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  return (
    <header className={cn('sticky top-0 z-nav border-b border-line bg-bg/85 backdrop-blur', className)}>
      <div className={cn(container, 'flex h-16 items-center gap-6')}>
        {brand ?? <Brand />}
        <nav aria-label="Site" className="ml-4 hidden items-center gap-6 lg:flex">
          {links.map((l) => <Link key={l.label} to={l.href} className="t-small font-medium text-fg-2 transition hover:text-fg hover:no-underline">{l.label}</Link>)}
        </nav>
        <div className="ml-auto hidden items-center gap-2 lg:flex">{actions}</div>
        <button type="button" className="ml-auto grid h-10 w-10 place-items-center rounded-full border border-line lg:hidden" aria-expanded={open} aria-controls={menuId} aria-label={open ? 'Close menu' : 'Open menu'} onClick={() => setOpen((o) => !o)}>
          {open ? <X className="h-4 w-4" aria-hidden /> : <Menu className="h-4 w-4" aria-hidden />}
        </button>
      </div>
      {open && (
        <div id={menuId} className={cn(container, 'space-y-1 pb-4 lg:hidden')}>
          {links.map((l) => <Link key={l.label} to={l.href} onClick={() => setOpen(false)} className="block rounded-xl px-3 py-3 font-medium text-fg-2 hover:bg-surface-2 hover:no-underline">{l.label}</Link>)}
          <div className="flex flex-wrap gap-2 pt-2">{actions}</div>
        </div>
      )}
    </header>
  );
}

/** Browser-style frame for product screenshots or live mini-UIs. */
export function AppWindow({ title = 'app.example.com', children, className }) {
  return (
    <div className={cn('card overflow-hidden', className)}>
      <div className="flex items-center gap-2 border-b border-line bg-surface-2 px-4 py-3">
        <span className="flex gap-1.5" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-danger" /><i className="h-2.5 w-2.5 rounded-full bg-warning" /><i className="h-2.5 w-2.5 rounded-full bg-success" /></span>
        <span className="t-mono ml-2 truncate text-fg-3">{title}</span>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

/** Two-column hero. badge: string. title: node (use <GradientText>). bullets: string[]. visual: node on the right. */
export function LandingHero({ badge, title, description, actions, bullets = [], visual, background, className }) {
  return (
    <div className="relative isolate overflow-hidden">
      {background && <div className="pointer-events-none absolute inset-0 -z-10 [mask-image:linear-gradient(to_bottom,#000_60%,transparent)]">{background}</div>}
    <section className={cn(container, 'grid items-center gap-12 py-14 lg:grid-cols-2 lg:py-24', className)}>
      <div>
        {badge && <Badge variant="neutral" className="mb-6 h-7 bg-surface px-3 text-[0.75rem]">{badge}</Badge>}
        <h1 className="text-[clamp(2.25rem,5.5vw,4rem)] font-semibold leading-[1.05] tracking-tight text-fg">{title}</h1>
        {description && <p className="t-body mt-6 max-w-xl text-fg-2">{description}</p>}
        {actions && <div className="mt-8 flex flex-wrap gap-3">{actions}</div>}
        {bullets.length > 0 && (
          <ul className="mt-8 grid gap-2 sm:grid-cols-2">
            {bullets.map((b) => <li key={b} className="t-small flex items-center gap-2 text-fg-2"><Check className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />{b}</li>)}
          </ul>
        )}
      </div>
      {visual && <div className="min-w-0">{visual}</div>}
    </section>
    </div>
  );
}

/** Centered or left section title. */
export function SectionHeading({ eyebrow, title, description, align = 'center', className }) {
  return (
    <div className={cn('mb-10 max-w-2xl', align === 'center' && 'mx-auto text-center', className)}>
      {eyebrow && <p className="t-eyebrow mb-3 text-accent-text">{eyebrow}</p>}
      <h2 className="text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold leading-tight tracking-tight">{title}</h2>
      {description && <p className="t-body mt-3 text-fg-2">{description}</p>}
    </div>
  );
}

/** Wrapper that gives a block the standard page width and vertical rhythm. */
export const LandingSection = ({ id, children, className }) => <section id={id} className={cn(container, 'scroll-mt-20 py-14 lg:py-20', className)}>{children}</section>;

/** Cards with an icon, title, text and a link button. items: [{ icon, title, description, cta: { label, href } }] */
export function FeatureGrid({ items, columns = 3 }) {
  const cols = { 2: 'md:grid-cols-2', 3: 'md:grid-cols-2 lg:grid-cols-3', 4: 'md:grid-cols-2 lg:grid-cols-4' }[columns];
  return (
    <ul className={cn('grid gap-4', cols)}>
      {items.map(({ icon: Icon, title, description, cta }) => (
        <li key={title} className="card flex flex-col p-6 transition hover:-translate-y-0.5 hover:shadow-md">
          {Icon && <span className="mb-5 grid h-11 w-11 place-items-center rounded-2xl bg-accent/10 text-accent-text"><Icon className="h-5 w-5" aria-hidden /></span>}
          <h3 className="t-h2">{title}</h3>
          <p className="t-small mt-2 flex-1 text-fg-2">{description}</p>
          {cta && <Button as="a" href={cta.href} size="sm" variant="outline" className="mt-5 self-start">{cta.label}</Button>}
        </li>
      ))}
    </ul>
  );
}

/** Numbered steps. items: [{ title, description }] */
export function StepList({ items }) {
  return (
    <ol className="grid gap-4 md:grid-cols-3">
      {items.map((s, i) => (
        <li key={s.title} className="card p-6">
          <span className="t-mono grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-fg" aria-hidden>{i + 1}</span>
          <h3 className="t-h2 mt-5">{s.title}</h3>
          <p className="t-small mt-2 text-fg-2">{s.description}</p>
        </li>
      ))}
    </ol>
  );
}

/** "Before / after" columns. left / right: { title, items: string[] }. The right column is highlighted. */
export function CompareColumns({ left, right }) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[[left, false], [right, true]].map(([col, good]) => (
        <div key={col.title} className={cn('card p-6', good && 'border-accent/40')}>
          <h3 className="t-h2 flex items-center gap-2">{col.title}{good && <Badge variant="accent">Better</Badge>}</h3>
          <ul className="mt-4 space-y-3">
            {col.items.map((it) => (
              <li key={it} className="t-small flex items-start gap-3 text-fg-2">
                {good ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-hidden /> : <X className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden />}
                <span>{it}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/** Pricing cards. tiers: [{ name, price, period?, was?, discount?, description?, features?, cta: { label, href }, popular? }] */
export function PricingTable({ tiers }) {
  return (
    <div className="grid items-stretch gap-4 md:grid-cols-3">
      {tiers.map((t) => (
        <div key={t.name} className={cn('card relative flex flex-col p-6', t.popular && 'border-accent shadow-md')}>
          {t.popular && <span className="t-eyebrow absolute -top-3 left-6 rounded-full bg-accent px-3 py-1.5 text-accent-fg">Most popular</span>}
          <h3 className="t-h2">{t.name}</h3>
          {t.description && <p className="t-small mt-1 text-fg-3">{t.description}</p>}
          <p className="mt-5 flex flex-wrap items-baseline gap-x-2">
            <span className="text-[2.5rem] font-semibold leading-none tracking-tight tabular-nums">{t.price}</span>
            {t.period && <span className="t-small text-fg-3">{t.period}</span>}
            {t.was && <s className="t-small text-fg-3">{t.was}</s>}
            {t.discount && <Badge variant="success">{t.discount}</Badge>}
          </p>
          {t.features && <ul className="mt-5 flex-1 space-y-2.5">{t.features.map((f) => <li key={f} className="t-small flex items-start gap-2.5 text-fg-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-accent-text" aria-hidden />{f}</li>)}</ul>}
          <Button as="a" href={t.cta.href} variant={t.popular ? 'primary' : 'outline'} className="mt-6" block>{t.cta.label}</Button>
        </div>
      ))}
    </div>
  );
}

/** Accessible accordion (one open at a time). items: [{ q, a }] */
export function FaqList({ items, className }) {
  const [open, setOpen] = useState(0);
  const base = useId();
  return (
    <div className={cn('mx-auto max-w-3xl space-y-3', className)}>
      {items.map((it, i) => {
        const isOpen = open === i;
        return (
          <div key={it.q} className="card overflow-hidden">
            <h3>
              <button type="button" id={`${base}-q${i}`} aria-expanded={isOpen} aria-controls={`${base}-a${i}`} onClick={() => setOpen(isOpen ? -1 : i)}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium transition hover:bg-surface-2">
                {it.q}
                {isOpen ? <Minus className="h-4 w-4 shrink-0 text-fg-3" aria-hidden /> : <Plus className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />}
              </button>
            </h3>
            {isOpen && <div id={`${base}-a${i}`} role="region" aria-labelledby={`${base}-q${i}`} className="t-small border-t border-line px-5 py-4 text-fg-2">{it.a}</div>}
          </div>
        );
      })}
    </div>
  );
}

/** Full-width call to action in the accent colour. */
export function CtaBand({ title, description, actions, className }) {
  return (
    <section className={cn(container, 'py-14')}>
      <div className={cn('card relative overflow-hidden bg-accent px-6 py-14 text-center text-accent-fg sm:px-12', className)} style={{ background: 'rgb(var(--accent))', borderColor: 'transparent' }}>
        <h2 className="mx-auto max-w-2xl text-[clamp(1.75rem,3.5vw,2.5rem)] font-semibold leading-tight tracking-tight">{title}</h2>
        {description && <p className="mx-auto mt-3 max-w-xl opacity-85">{description}</p>}
        {actions && <div className="mt-8 flex flex-wrap justify-center gap-3">{actions}</div>}
      </div>
    </section>
  );
}

/** Footer. groups: [{ title, links: [{ label, href }] }]  legal: [{ label, href }] */
export function SiteFooter({ brand, description, groups = [], legal = [], copyright }) {
  return (
    <footer className="border-t border-line">
      <div className={cn(container, 'grid gap-10 py-12 md:grid-cols-[1.4fr_repeat(3,1fr)]')}>
        <div>{brand ?? <Brand />}{description && <p className="t-small mt-4 max-w-xs text-fg-3">{description}</p>}</div>
        {groups.map((g) => (
          <nav key={g.title} aria-label={g.title}>
            <p className="t-eyebrow mb-4 text-fg-3">{g.title}</p>
            <ul className="space-y-2.5">{g.links.map((l) => <li key={l.label}>{l.href ? <Link to={l.href} className="t-small text-fg-2 hover:text-fg">{l.label}</Link> : <span className="t-small text-fg-3">{l.label}</span>}</li>)}</ul>
          </nav>
        ))}
      </div>
      <div className={cn(container, 'flex flex-wrap items-center justify-between gap-3 border-t border-line py-6')}>
        <p className="t-caption text-fg-3">{copyright}</p>
        <ul className="flex flex-wrap gap-5">{legal.map((l) => <li key={l.label}>{l.href ? <Link to={l.href} className="t-caption text-fg-3 hover:text-fg">{l.label}</Link> : <span className="t-caption text-fg-3">{l.label}</span>}</li>)}</ul>
      </div>
    </footer>
  );
}

/**
 * Whole landing page from one config. Every key is optional; omit a section to drop it.
 *   { brand, nav: { links, actions }, hero, features: { id, eyebrow, title, description, items },
 *     steps: { id, title, items }, compare: { id, title, left, right }, pricing: { id, title, description, tiers },
 *     faq: { id, title, items }, cta: { title, description, actions }, footer: { description, groups, legal, copyright } }
 */
export function LandingPage({ brand, nav, hero, features, steps, compare, pricing, faq, cta, footer, extra }) {
  return (
    <div className="bg-bg text-fg">
      {nav && <LandingNav brand={brand} {...nav} />}
      {hero && <LandingHero {...hero} />}
      {extra}
      {features && <LandingSection id={features.id}><SectionHeading eyebrow={features.eyebrow} title={features.title} description={features.description} /><FeatureGrid items={features.items} columns={features.columns} /></LandingSection>}
      {steps && <LandingSection id={steps.id}><SectionHeading eyebrow={steps.eyebrow} title={steps.title} /><StepList items={steps.items} /></LandingSection>}
      {compare && <LandingSection id={compare.id}><SectionHeading eyebrow={compare.eyebrow} title={compare.title} /><CompareColumns left={compare.left} right={compare.right} /></LandingSection>}
      {pricing && <LandingSection id={pricing.id}><SectionHeading eyebrow={pricing.eyebrow} title={pricing.title} description={pricing.description} /><PricingTable tiers={pricing.tiers} /></LandingSection>}
      {faq && <LandingSection id={faq.id}><SectionHeading eyebrow={faq.eyebrow} title={faq.title} /><FaqList items={faq.items} /></LandingSection>}
      {cta && <CtaBand {...cta} />}
      {footer && <SiteFooter brand={brand} {...footer} />}
    </div>
  );
}
