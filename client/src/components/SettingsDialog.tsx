import { useEffect, useRef } from 'react';
import type { AppSettings } from '../contexts/SettingsContext';
import './SettingsDialog.css';

interface Props {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
  onChangePlaylist: () => void;
}

export function SettingsDialog({ settings, onChange, onClose, onChangePlaylist }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  function close() {
    dialogRef.current?.close();
    onClose();
  }

  return (
    <dialog ref={dialogRef} className="settings-dialog" aria-labelledby="settings-title" onCancel={event => { event.preventDefault(); close(); }}>
      <header className="settings-heading">
        <h2 id="settings-title">Settings</h2>
        <button className="sidebar-close" onClick={close} aria-label="Close settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
        </button>
      </header>
      <p className="settings-intro">Choose which extra actions appear on your channel and programme cards.</p>
      <label className="settings-option">
        <span><strong>Show Copy buttons</strong><small>Copy stream links to your clipboard.</small></span>
        <input type="checkbox" role="switch" aria-label="Show Copy buttons" checked={settings.showCopy} onChange={event => onChange({ ...settings, showCopy: event.target.checked })} />
      </label>
      <label className="settings-option">
        <span><strong>Show Download buttons</strong><small>Save available programmes as MP4 files.</small></span>
        <input type="checkbox" role="switch" aria-label="Show Download buttons" checked={settings.showDownload} onChange={event => onChange({ ...settings, showDownload: event.target.checked })} />
      </label>
      <p className="settings-note">Changes apply immediately and are remembered in this browser.</p>
      <div className="settings-playlist">
        <h3>Playlist</h3>
        <button onClick={() => { dialogRef.current?.close(); onChangePlaylist(); }}>Change playlist URL</button>
      </div>
    </dialog>
  );
}
