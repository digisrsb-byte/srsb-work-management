import { useEffect, useState } from 'react';
import { DownloadCloud, RefreshCw, X } from 'lucide-react';

export default function UpdateBanner() {
  const desktop = window.srsbDesktop;
  const [update, setUpdate] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!desktop?.onUpdateAvailable) return undefined;
    const removeAvailable = desktop.onUpdateAvailable((data) => {
      setUpdate(data);
      setHidden(false);
    });
    const removeProgress = desktop.onUpdateProgress((data) => setProgress(data.progress));
    return () => {
      removeAvailable?.();
      removeProgress?.();
    };
  }, [desktop]);

  if (!desktop || !update || hidden) return null;

  async function install() {
    try {
      setDownloading(true);
      setError('');
      const result = await desktop.downloadUpdate(update);
      if (!result?.success && !result?.openedReleasePage) {
        setError('The update could not be downloaded.');
      }
    } catch (requestError) {
      setError(requestError?.message || 'The update could not be downloaded.');
      setDownloading(false);
    }
  }

  return (
    <div className="update-banner">
      <div className="update-banner-icon"><DownloadCloud size={20} /></div>
      <div className="update-banner-copy">
        <strong>Version {update.latestVersion} is available</strong>
        <span>Current version: {update.currentVersion}. Install the update and the application will restart.</span>
        {error && <small>{error}</small>}
      </div>
      {downloading && <div className="update-progress"><RefreshCw className="spin" size={16} /><span>{progress === null ? 'Downloading…' : `${progress}%`}</span></div>}
      <button className="btn btn-primary" type="button" onClick={install} disabled={downloading}>{downloading ? 'Preparing…' : 'Update Now'}</button>
      <button className="icon-btn update-close" type="button" onClick={() => setHidden(true)} aria-label="Remind me later"><X size={18} /></button>
    </div>
  );
}
