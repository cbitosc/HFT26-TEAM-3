import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Brand, Button, CommandPaletteProvider, ThemeSwitcher, useCommandPalette } from './ui-kit';
import { FilePlus2, FileText, FolderSearch, Layers, LayoutDashboard, ScanSearch, Search } from 'lucide-react';
import { api } from './api';
import { useCaseContext } from './caseContext';
import DesignationBadge from './components/DesignationBadge';

/** Exactly five sections. Evidence, Reconstruction and Reports act on the selected case; their bare routes redirect to it. */
export const NAV = [
  { id: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard, mobile: true },
  { id: 'cases', label: 'Cases', to: '/cases', icon: FolderSearch, mobile: true },
  { id: 'evidence', label: 'Evidence', to: '/evidence', icon: Layers, mobile: true },
  { id: 'reconstruction', label: 'Reconstruction', shortLabel: 'Recon', to: '/reconstruction', icon: ScanSearch, mobile: true },
  { id: 'reports', label: 'Reports', to: '/reports', icon: FileText, mobile: true },
];

/** The sidebar badge and the page header read the same stored designation. Nothing is inferred here. */
function CaseChip() {
  const selected = useCaseContext((s) => s.selected);
  if (!selected) {
    return <p className="t-caption text-fg-3" data-testid="case-context">No case selected. Pick one under <Link to="/cases">Cases</Link>.</p>;
  }
  return (
    <div data-testid="case-context" className="space-y-1.5">
      <p className="t-eyebrow text-fg-3">Selected case</p>
      <Link to={`/reconstruction/${selected.id}`} className="block rounded-lg border border-line bg-surface-2/60 p-2.5 hover:no-underline">
        <span className="t-small block truncate font-medium text-fg">{selected.title || selected.id}</span>
        <span className="mono t-caption block text-fg-3">{selected.code || selected.id}</span>
        {selected.designation && <span className="mt-1.5 inline-block"><DesignationBadge designation={selected.designation} /></span>}
      </Link>
    </div>
  );
}

function Frame({ crumbs, wide, children, actions }) {
  const { pathname } = useLocation();
  const palette = useCommandPalette();
  return (
    <div className="tl-frame">
      <a href="#main" className="sr-only focus:not-sr-only">Skip to content</a>
      <header className="tl-global-header">
        <Brand name="TraceLine" to="/" />
        <nav aria-label="Primary" className="tl-global-nav">{NAV.map(item => { const Icon = item.icon; const active = pathname === item.to || pathname.startsWith(`${item.to}/`); return <Link key={item.id} to={item.to} aria-current={active ? 'page' : undefined}><Icon size={16}/><span>{item.label}</span></Link>; })}</nav>
        <div className="tl-header-actions"><button className="tl-search-button" onClick={palette.open} aria-label="Open command palette"><Search size={17}/><span>Search</span><kbd>⌘ K</kbd></button><ThemeSwitcher align="right" /><Button as={Link} to="/new" variant="primary" size="sm" icon={FilePlus2}>New case</Button></div>
      </header>
      <div className="tl-context-bar"><span className="t-eyebrow text-accent-text">INVESTIGATION WORKSPACE</span><div className="tl-context-case"><CaseChip /></div>{actions}</div>
      <main id="main" className={`tl-page ${wide ? 'tl-page-wide' : ''}`}>{children}</main>
    </div>
  );
}

/** App frame for every page except the landing page. Loads the case list once for the command palette (real cases only)
 *  and checks that the remembered case still exists. */
export default function Shell({ crumbs = [], wide = false, actions, children }) {
  const nav = useNavigate();
  const [cases, setCases] = useState([]);
  useEffect(() => {
    api.cases().then((r) => {
      setCases(r.items);
      const cur = useCaseContext.getState().selected;
      if (cur) {
        const live = r.items.find((c) => c.id === cur.id);
        if (!live) useCaseContext.getState().clear();
        else useCaseContext.getState().select(live);
      }
    }).catch(() => setCases([]));
  }, []);
  const commands = useMemo(() => [
    { id: 'go-dash', group: 'Navigate', label: 'Dashboard', icon: LayoutDashboard, run: () => nav('/dashboard') },
    { id: 'go-cases', group: 'Navigate', label: 'Cases', icon: FolderSearch, run: () => nav('/cases') },
    { id: 'go-new', group: 'Navigate', label: 'New investigation', icon: FilePlus2, run: () => nav('/new') },
    ...cases.flatMap((c) => [
      { id: `open-${c.id}`, group: 'Cases', label: `Open ${c.title}`, icon: ScanSearch, keywords: [c.code, c.designation], run: () => nav(`/reconstruction/${c.id}`) },
      { id: `ev-${c.id}`, group: 'Evidence', label: `Evidence: ${c.title}`, icon: Layers, keywords: [c.code], run: () => nav(`/evidence/${c.id}`) },
      { id: `rep-${c.id}`, group: 'Reports', label: `Report: ${c.title}`, icon: Search, keywords: [c.code], run: () => nav(`/reports/${c.id}`) },
    ]),
  ], [cases, nav]);
  return (
    <CommandPaletteProvider commands={commands} placeholder="Jump to a case, report or action…">
      <Frame crumbs={[{ label: 'TraceLine', to: '/dashboard' }, ...crumbs]} wide={wide} actions={actions}>{children}</Frame>
    </CommandPaletteProvider>
  );
}
