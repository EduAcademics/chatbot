import { useEffect } from "react";

interface FilePreviewModalProps {
  url: string;
  filename: string;
  onClose: () => void;
}

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif)(?:[?#].*)?$/i;
const PDF_EXT_RE = /\.pdf(?:[?#].*)?$/i;
const EDU_FILE_URL_RE = /api\.eduacademics\.com\/v1\/files\//i;

const isImageUrl = (url: string): boolean => IMAGE_EXT_RE.test(url);
const isPdfUrl = (url: string): boolean => PDF_EXT_RE.test(url);

export default function FilePreviewModal({
  url,
  filename,
  onClose,
}: FilePreviewModalProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const imageView = isImageUrl(url);
  const pdfView = isPdfUrl(url) || EDU_FILE_URL_RE.test(url);

  return (
    <div
      className="file-preview-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Attachment preview"
    >
      <div className="file-preview-modal" onClick={(e) => e.stopPropagation()}>
        <div className="file-preview-topbar">
          <div className="file-preview-filename" title={filename}>
            {filename || "Attachment Preview"}
          </div>
          <button
            className="file-preview-close"
            type="button"
            onClick={onClose}
            aria-label="Close preview"
          >
            ✕
          </button>
        </div>

        <div className="file-preview-content">
          {imageView ? (
            <img
              src={url}
              alt={filename || "Attachment"}
              className="file-preview-image"
            />
          ) : pdfView ? (
            <iframe
              src={url}
              className="file-preview-iframe"
              title={filename || "Attachment"}
            />
          ) : (
            <iframe
              src={url}
              className="file-preview-iframe"
              title={filename || "Attachment"}
            />
          )}
        </div>
      </div>
    </div>
  );
}
