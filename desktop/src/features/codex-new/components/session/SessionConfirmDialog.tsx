import { useEffect, useRef, type ReactNode } from "react";
import { useI18n } from "@/i18n/I18nProvider";

type SessionConfirmDialogProps = {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  isConfirming?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
};

export function SessionConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel,
  cancelLabel,
  isConfirming = false,
  onConfirm,
  onCancel,
  children,
}: SessionConfirmDialogProps) {
  const { t } = useI18n();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    cancelRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onCancel]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="session-confirm-overlay" role="presentation" onClick={onCancel}>
      <div
        className="session-confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="session-confirm-title"
        aria-describedby="session-confirm-description"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id="session-confirm-title" className="session-confirm-title">
          {title}
        </h3>
        <p id="session-confirm-description" className="session-confirm-description">
          {description}
        </p>
        {children}
        <div className="session-confirm-actions">
          <button
            ref={cancelRef}
            type="button"
            className="session-confirm-button"
            onClick={onCancel}
            disabled={isConfirming}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="session-confirm-button is-danger"
            onClick={onConfirm}
            disabled={isConfirming}
          >
            {isConfirming
              ? t("codexNew.workbench.confirm.working", "Working...")
              : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
