import { convertFileSrc } from "@tauri-apps/api/core";
import File from "lucide-react/dist/esm/icons/file";
import Image from "lucide-react/dist/esm/icons/image";
import X from "lucide-react/dist/esm/icons/x";
import {
  attachmentFileName,
  isImageAttachmentPath,
  isInlineImageAttachment,
  isRemoteImageAttachment,
} from "../../../utils/attachments";

type ComposerAttachmentsProps = {
  imageAttachments: string[];
  fileAttachments: string[];
  disabled: boolean;
  onRemoveAttachment?: (path: string) => void;
};

function attachmentPreviewSrc(path: string) {
  if (isInlineImageAttachment(path)) {
    return path;
  }
  if (isRemoteImageAttachment(path)) {
    return path;
  }
  try {
    return convertFileSrc(path);
  } catch {
    return "";
  }
}

export function ComposerAttachments({
  imageAttachments,
  fileAttachments,
  disabled,
  onRemoveAttachment,
}: ComposerAttachmentsProps) {
  const attachments = [...imageAttachments, ...fileAttachments];
  if (attachments.length === 0) {
    return null;
  }

  return (
    <div className="composer-attachments">
      {attachments.map((path) => {
        const isImage = isImageAttachmentPath(path);
        const title = attachmentFileName(path);
        const titleAttr = isInlineImageAttachment(path) ? "Pasted image" : path;
        const previewSrc = isImage ? attachmentPreviewSrc(path) : "";
        return (
          <div
            key={path}
            className="composer-attachment"
            title={titleAttr}
          >
            {previewSrc && (
              <span className="composer-attachment-preview" aria-hidden>
                <img src={previewSrc} alt="" />
              </span>
            )}
            {previewSrc ? (
              <span className="composer-attachment-thumb" aria-hidden>
                <img src={previewSrc} alt="" />
              </span>
            ) : (
              <span className="composer-icon" aria-hidden>
                {isImage ? <Image size={14} /> : <File size={14} />}
              </span>
            )}
            <span className="composer-attachment-name">{title}</span>
            <button
              type="button"
              className="composer-attachment-remove"
              onClick={() => onRemoveAttachment?.(path)}
              aria-label={`Remove ${title}`}
              disabled={disabled}
            >
              <X size={12} aria-hidden />
            </button>
          </div>
        );
      })}
    </div>
  );
}
