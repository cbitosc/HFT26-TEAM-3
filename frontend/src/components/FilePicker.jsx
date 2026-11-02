import { useRef } from 'react';
import { FileVideo, Upload, X } from 'lucide-react';
import { Button, IconButton } from '../ui-kit';

/** Styled file chooser built from kit controls: the native input is visually hidden and driven by a kit Button; chosen files are listed. */
export default function FilePicker({ accept, multiple, files, onChange, disabled, label = 'Choose file', hint }) {
  const ref = useRef(null);
  return (
    <div className="rounded-xl border border-dashed border-line bg-surface-2/40 p-4">
      <input ref={ref} type="file" accept={accept} multiple={multiple} disabled={disabled} className="sr-only" tabIndex={-1}
             onChange={(e) => { onChange([...e.target.files]); e.target.value = ''; }} />
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" icon={Upload} disabled={disabled} onClick={() => ref.current?.click()}>{files.length ? (multiple ? 'Add or replace files' : 'Replace file') : label}</Button>
        <span className="t-caption text-fg-3">{files.length ? `${files.length} selected` : hint}</span>
      </div>
      {files.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg border border-line bg-surface px-3 py-1.5">
              <FileVideo className="h-4 w-4 shrink-0 text-fg-3" aria-hidden />
              <span className="t-small min-w-0 flex-1 truncate">{f.name}</span>
              <span className="t-caption text-fg-3">{(f.size / 1048576).toFixed(1)} MB</span>
              <IconButton icon={X} label={`Remove ${f.name}`} size="sm" disabled={disabled} onClick={() => onChange(files.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
