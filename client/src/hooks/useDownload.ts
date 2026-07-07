import { useCallback, useRef, useState } from 'react';
import type { Programme } from '../types';
import { formatFileSize, getProgrammeDuration, probeStream, triggerDownload } from '../utils/catchup';

export type DownloadStatus = 'idle' | 'started';

export function useDownload(streamUrl: string, programme: Programme, channelName: string | undefined) {
  const [sizeLabel, setSizeLabel] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [status, setStatus] = useState<DownloadStatus>('idle');
  const estimatedBytesRef = useRef(0);

  const handleHover = useCallback(() => {
    if (sizeLabel || probing || !streamUrl) return;
    setProbing(true);
    probeStream(streamUrl, getProgrammeDuration(programme))
      .then((bytes) => {
        if (bytes > 0) {
          estimatedBytesRef.current = bytes;
          setSizeLabel(`~${formatFileSize(bytes)}`);
        }
      })
      .catch(() => {})
      .finally(() => setProbing(false));
  }, [sizeLabel, probing, streamUrl, programme]);

  const start = useCallback(() => {
    if (!streamUrl) return;
    triggerDownload(streamUrl, programme, channelName, estimatedBytesRef.current);
    setStatus('started');
    setTimeout(() => setStatus('idle'), 2500);
  }, [streamUrl, programme, channelName]);

  return { sizeLabel, probing, handleHover, status, start };
}
