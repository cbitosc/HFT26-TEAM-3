// ---- primitives
export { default as Alert } from './components/Alert';
export { default as AnimatedValue } from './components/AnimatedValue';
export { default as Avatar } from './components/Avatar';
export { Badge, StatusBadge } from './components/Badge';
export { default as Breadcrumb } from './components/Breadcrumb';
export { default as BurstToggle } from './components/BurstToggle';
export { default as Button, buttonStyles } from './components/Button';
export { Card, Pill, SectionHeader, StatCard, StatGroup } from './components/Card';
export { default as ConfirmationDialog } from './components/ConfirmationDialog';
export { default as MetricCard } from './components/MetricCard';
export { default as Drawer } from './components/Drawer';
export { default as Dropdown } from './components/Dropdown';
export { EmptyState, ErrorState, LoadingState, Skeleton, Spinner } from './components/Feedback';
export { Checkbox, Field, Input, SearchInput, Select, Textarea, Toggle } from './components/Field';
export { default as FileGlyph } from './components/FileGlyph';
export { default as IconButton } from './components/IconButton';
export { FilterChips, Highlight, ResultCard, SearchBox } from './components/Search';
export { default as HistoryList } from './components/History';
export { highlightParts } from './utils/text';
export { groupByDay } from './utils/dates';
export { default as ItemCard } from './components/ItemCard';
export { default as Modal, Scrim } from './components/Modal';
export { default as Pagination } from './components/Pagination';
export { ProgressBar, ProgressCircle } from './components/Progress';
export { DataTable, Table, Td, Th } from './components/Table';
export { Segmented, TabPanel, Tabs } from './components/Tabs';
export { ToastProvider, useToast } from './components/Toast';
export { default as TimeTracker, formatClock } from './components/TimeTracker';
export { default as Tooltip } from './components/Tooltip';
export { default as Viz } from './components/Viz';

// ---- ready-made compositions
export { Banner, Chip, ConfirmDialog, LevelBadge, PriorityBars, Section, SkeletonRows, TagInput, cx, useNotify } from './components/composed';

// ---- charts (dependency-free SVG)
export { default as ActivityTimeline } from './charts/ActivityTimeline';
export { default as BarChart } from './charts/BarChart';
export { default as ComparisonView } from './charts/ComparisonView';
export { default as GaugeChart } from './charts/GaugeChart';
export { default as GapChart } from './charts/GapChart';
export { default as DonutChart } from './charts/DonutChart';
export { default as LineChart, ChartLegend } from './charts/LineChart';
export { default as ProgressChart } from './charts/ProgressChart';
export { default as Sparkline } from './charts/Sparkline';

// ---- effects
export { default as InteractiveBackground } from './effects/InteractiveBackground';
export { default as Marquee } from './effects/Marquee';
export { default as RevealText } from './effects/RevealText';
export { default as RotatingText } from './effects/RotatingText';
export { default as SpotlightCard } from './effects/SpotlightCard';

// ---- layout
export { default as AppShell } from './layout/AppShell';
export { default as Brand, BrandMark } from './layout/Brand';
export { CommandPaletteProvider, useCommandPalette } from './layout/CommandPalette';
export { default as MobileNav } from './layout/MobileNav';
export { default as PageHeader } from './layout/PageHeader';
export { default as Sidebar } from './layout/Sidebar';
export { default as ThemeSwitcher } from './layout/ThemeSwitcher';
export { default as Topbar } from './layout/Topbar';

// ---- landing page blocks
export { AppWindow, CompareColumns, CtaBand, FaqList, FeatureGrid, GradientText, LandingHero, LandingNav, LandingPage, LandingSection, PricingTable, SectionHeading, SiteFooter, StepList } from './landing/Landing';

// ---- hooks, theming, utilities
export { useElementWidth } from './hooks/useElementWidth';
export { useHotkey } from './hooks/useHotkey';
export { useOverlay } from './hooks/useOverlay';
export { ThemeProvider, useTheme } from './hooks/useTheme';
export { accentPresets, themes } from './config/themes';
export { LEVEL_STYLE } from './config/levels';
export { cn } from './utils/cn';
export { timeAgo } from './utils/format';
export { Link, LinkProvider } from './utils/link';
