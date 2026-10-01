import { createContext } from 'react';

export interface AppSettings {
  showCopy: boolean;
  showDownload: boolean;
}

export const SETTINGS_KEY = 'openiptv-settings';
export const SettingsContext = createContext<AppSettings>({ showCopy: false, showDownload: false });

export function readSettings(): AppSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}');
    return { showCopy: saved?.showCopy === true, showDownload: saved?.showDownload === true };
  } catch {
    return { showCopy: false, showDownload: false };
  }
}
