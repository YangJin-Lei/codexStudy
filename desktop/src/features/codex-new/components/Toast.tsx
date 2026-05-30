import { useEffect, useState } from "react";
import CheckCircle2 from "lucide-react/dist/esm/icons/check-circle-2";
import XCircle from "lucide-react/dist/esm/icons/x-circle";
import Info from "lucide-react/dist/esm/icons/info";
import X from "lucide-react/dist/esm/icons/x";
import "./Toast.css";

export type ToastType = "success" | "error" | "info";

export type ToastMessage = {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
};

type ToastProps = {
  toast: ToastMessage;
  onClose: (id: string) => void;
};

function Toast({ toast, onClose }: ToastProps) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = toast.duration ?? 3000;
    const timer = setTimeout(() => {
      setIsExiting(true);
      setTimeout(() => onClose(toast.id), 300);
    }, duration);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onClose]);

  const handleClose = () => {
    setIsExiting(true);
    setTimeout(() => onClose(toast.id), 300);
  };

  const Icon = toast.type === "success" 
    ? CheckCircle2 
    : toast.type === "error" 
    ? XCircle 
    : Info;

  return (
    <div className={`toast toast-${toast.type}${isExiting ? " toast-exiting" : ""}`}>
      <div className="toast-icon">
        <Icon size={18} />
      </div>
      <div className="toast-message">{toast.message}</div>
      <button className="toast-close" onClick={handleClose} aria-label="Close">
        <X size={14} />
      </button>
    </div>
  );
}

type ToastContainerProps = {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
};

export function ToastContainer({ toasts, onClose }: ToastContainerProps) {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} onClose={onClose} />
      ))}
    </div>
  );
}
