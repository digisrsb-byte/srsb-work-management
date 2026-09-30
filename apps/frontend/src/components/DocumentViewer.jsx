import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, ExternalLink } from 'lucide-react';
import { Modal } from '../pages/admin/assets/assetUi.jsx';

const MAX_PAGES = 30;

async function loadPdfJs() {
  const [pdfjs, worker] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url')
  ]);
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs;
}

// Renders pages with pdf.js so PDFs display in every browser, including mobile and
// embedded browsers that cannot show a PDF inside an iframe.
function PdfPages({ blob, url, fileName }) {
  const containerRef = useRef(null);
  const [state, setState] = useState({ status: 'loading', pages: 0, shown: 0 });

  useEffect(() => {
    let cancelled = false;
    let pdf = null;
    (async () => {
      try {
        const pdfjs = await loadPdfJs();
        pdf = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
        const container = containerRef.current;
        if (cancelled || !container) return;
        const shown = Math.min(pdf.numPages, MAX_PAGES);
        const width = Math.max(320, container.clientWidth - 24);
        const ratio = window.devicePixelRatio || 1;
        for (let n = 1; n <= shown; n += 1) {
          const page = await pdf.getPage(n);
          if (cancelled) return;
          const base = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: (width / base.width) * ratio });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          canvas.style.width = `${viewport.width / ratio}px`;
          canvas.setAttribute('aria-label', `${fileName || 'Document'} page ${n}`);
          container.appendChild(canvas);
          await page.render({ canvas, viewport }).promise;
        }
        if (!cancelled) setState({ status: 'ready', pages: pdf.numPages, shown });
      } catch {
        if (!cancelled) setState({ status: 'fallback', pages: 0, shown: 0 });
      }
    })();
    return () => {
      cancelled = true;
      pdf?.destroy();
    };
  }, [blob, fileName]);

  if (state.status === 'fallback') {
    return <iframe src={url} title={fileName || 'Document preview'} />;
  }
  return (
    <div className="document-viewer-pages" aria-busy={state.status === 'loading'}>
      {state.status === 'loading' ? <div className="helper-text">Loading preview…</div> : null}
      <div ref={containerRef} className="document-viewer-canvas" />
      {state.pages > state.shown ? (
        <div className="helper-text">
          Showing the first {state.shown} of {state.pages} pages. Download the file to see the rest.
        </div>
      ) : null}
    </div>
  );
}

function DocumentViewer({ blob, url, fileName, mimeType, onClose }) {
  const isImage = /^image\//.test(mimeType || '');
  return (
    <Modal title={fileName || 'Document'} onClose={onClose} width={960}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <a className="btn btn-primary" href={url} download={fileName || 'document'}>
          <Download size={16} aria-hidden="true" /> Download
        </a>
        <a className="btn btn-secondary" href={url} target="_blank" rel="noopener noreferrer">
          <ExternalLink size={16} aria-hidden="true" /> Open in new tab
        </a>
      </div>
      <div className="document-viewer-frame">
        {isImage ? (
          <img src={url} alt={fileName || 'Uploaded document'} />
        ) : (
          <PdfPages blob={blob} url={url} fileName={fileName} />
        )}
      </div>
    </Modal>
  );
}

// Shows a PDF or image blob in an in-app viewer, so previews never depend on popup windows.
export function showDocumentViewer({ blob, fileName, mimeType }) {
  const url = window.URL.createObjectURL(blob);
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const close = () => {
    root.unmount();
    host.remove();
    window.URL.revokeObjectURL(url);
  };
  root.render(<DocumentViewer blob={blob} url={url} fileName={fileName} mimeType={mimeType} onClose={close} />);
  return close;
}
