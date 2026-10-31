/**
 * Title block at the top of every app page. The last word of the title is set in the accent
 * color. Pass an array for a stacked title and `accentIndex` to choose which line is accented.
 */
export default function PageHeader({ title, accentIndex, description, actions }) {
  const lines = Array.isArray(title) ? title : null;
  const plain = typeof title === 'string';
  const words = lines || !plain ? null : title.split(' ');
  const accentWord = !lines && words.length > 1 ? words.pop() : null;

  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="t-h1">
          {lines
            ? lines.map((l, i) => (
                <span key={l} className={`block ${i === (accentIndex ?? lines.length - 1) ? 'text-accent-text' : ''}`}>{l}</span>
              ))
            : !plain ? title
            : (
              <>
                {words.join(' ')}
                {accentWord && <span className="text-accent-text"> {accentWord}</span>}
              </>
            )}
        </h1>
        {description && <p className="t-body mt-3 max-w-prose text-fg-2">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  );
}
