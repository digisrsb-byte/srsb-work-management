import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, DownloadCloud, RefreshCw, X } from 'lucide-react';

function featureLines(notes) {
  return String(notes || '')
    .split(/\r?\n/)
    .map((line) => line
      .replace(/^#{1,6}\s*/, '')
      .replace(/^[-*+]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .trim())
    .filter(Boolean)
    .slice(0, 8);
}

export default function UpdateBanner() {
  const desktop = window.srsbDesktop;
  const [update, setUpdate] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [ready, setReady] = useState(false);
  const [progress, setProgress] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');

  const features = useMemo(() => featureLines(update?.notes), [update?.notes]);

  useEffect(() => {
    if (!desktop?.onUpdateAvailable) return undefined;

    const removeAvailable = desktop.onUpdateAvailable((data) => {
      setUpdate(data);
      setReady(Boolean(data?.prepared));
      setDownloading(!data?.prepared);
      setHidden(false);
      setError('');
    });

    const removeProgress = desktop.onUpdateProgress((data) => {
      setDownloading(true);
      setProgress(data.progress);
    });

    const removeReady = desktop.onUpdateReady((data) => {
      setUpdate((current) => ({ ...(current || {}), ...data }));
      setDownloading(false);
      setProgress(100);
      setReady(true);
      setError('');
      setHidden(false);
    });

    const removeError = desktop.onUpdateDownloadError?.((data) => {
      setDownloading(false);
      setError(data?.message || 'Automatic update download failed.');
    });

    return () => {
      removeAvailable?.();
      removeProgress?.();
      removeReady?.();
      removeError?.();
    };
  }, [desktop]);

  if (!desktop || !update || hidden) return null;

  async function install() {
    try {
      setError('');

      if (ready && desktop.installPreparedUpdate) {
        const result = await desktop.installPreparedUpdate();
        if (!result?.success) {
          setError(result?.message || 'The update could not be installed.');
        }
        return;
      }

      setDownloading(true);
      const result = await desktop.downloadUpdate();
      if (!result?.success && !result?.openedReleasePage) {
        setError(result?.message || 'The update could not be downloaded.');
        setDownloading(false);
      }
    } catch (requestError) {
      setError(requestError?.message || 'The update could not be installed.');
      setDownloading(false);
    }
  }

  return (
    <div className="update-banner">
      <div className="update-banner-icon">
        {ready ? <CheckCircle2 size={20} /> : <DownloadCloud size={20} />}
      </div>

      <div className="update-banner-copy">
        <strong>Version {update.latestVersion} is available</strong>
        <span>
          {ready
            ? 'Update downloaded. Restart the application to install it.'
            : 'Downloading the update automatically in the background.'}
        </span>

        {features.length > 0 && (
          <div className="update-feature-list">
            <b>What's new</b>
            <ul>
              {features.map((feature) => <li key={feature}>{feature}</li>)}
            </ul>
          </div>
        )}

        {error && <small>{error}</small>}
      </div>

      {downloading && (
        <div className="update-progress">
          <RefreshCw className="spin" size={16} />
          <span>{progress === null ? 'Downloading…' : `${progress}%`}</span>
        </div>
      )}

      <button
        className="btn btn-primary"
        type="button"
        onClick={install}
        disabled={downloading && !ready}
      >
        {ready ? 'Restart & Install' : downloading ? 'Downloading…' : 'Download & Install'}
      </button>

      <button
        className="icon-btn update-close"
        type="button"
        onClick={() => setHidden(true)}
        aria-label="Remind me later"
      >
        <X size={18} />
      </button>
    </div>
  );
}
