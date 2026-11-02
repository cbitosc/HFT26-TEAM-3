import { Palette } from 'lucide-react';
import Dropdown from '../components/Dropdown';
import IconButton from '../components/IconButton';
import { useTheme } from '../hooks/useTheme';

/** Palette icon that opens a menu of the available themes. Needs <ThemeProvider> above it. */
export default function ThemeSwitcher({ align }) {
  const { theme, setTheme, themes } = useTheme();
  return (
    <Dropdown
      align={align}
      label="Theme"
      width="w-56"
      trigger={({ open, ...p }) => <IconButton icon={Palette} label="Change theme" tooltip={!open} {...p} />}
      items={[{ heading: 'Theme' }, ...themes.map((t) => ({ label: t.label, active: t.id === theme, onClick: () => setTheme(t.id) }))]}
    />
  );
}
