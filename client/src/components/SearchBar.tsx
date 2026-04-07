import { useEffect, useRef, useState } from 'react';

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export function SearchBar({ value, onChange }: Props) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = e.target.value;
    setLocal(v);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(v), 300);
  }

  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder="Search shows, channels..."
        value={local}
        onChange={handleChange}
      />
      {local && (
        <button className="search-clear" onClick={() => { setLocal(''); onChange(''); }}>
          ×
        </button>
      )}
    </div>
  );
}
