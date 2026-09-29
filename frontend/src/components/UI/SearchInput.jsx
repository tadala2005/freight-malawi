import { useEffect, useRef, useState } from 'react';
import { Search } from 'lucide-react';

/**
 * Uncontrolled-feeling but stable: keeps its own immediate `text` state so
 * the input never loses focus while typing, and calls onDebouncedChange
 * after a pause. Syncs from `value` only when it changes externally
 * (e.g. a "clear filters" action), never on every keystroke.
 */
export default function SearchInput({ value = '', onDebouncedChange, placeholder = 'Search…', delay = 350 }) {
  const [text, setText] = useState(value);
  const isExternalUpdate = useRef(false);

  useEffect(() => {
    if (value !== text) {
      isExternalUpdate.current = true;
      setText(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useEffect(() => {
    if (isExternalUpdate.current) {
      isExternalUpdate.current = false;
      return undefined;
    }
    const handle = setTimeout(() => onDebouncedChange(text), delay);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);

  return (
    <div style={{ position: 'relative', flex: 1, maxWidth: 360 }}>
      <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--fm-muted)' }} />
      <input
        className="fm-input"
        style={{ paddingLeft: 36 }}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
      />
    </div>
  );
}
