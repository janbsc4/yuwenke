import { useLayoutEffect, useRef, type ReactNode, type RefObject } from "react";

interface ModalProps {
  children: ReactNode;
  className: string;
  labelledBy: string;
  onDismiss: () => void;
  dismissible?: boolean;
  returnFocus?: RefObject<HTMLButtonElement | null>;
}

export function Modal({
  children, className, labelledBy, onDismiss, dismissible = true, returnFocus,
}: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement;
    const fallback = returnFocus?.current;
    dialog.showModal();
    return () => {
      dialog.close();
      // Menu items disappear when their dialog opens; return to the menu button.
      if (opener === document.body || !opener?.isConnected) fallback?.focus();
    };
  }, [returnFocus]);

  return (
    <dialog
      ref={ref}
      className={`modal-dialog ${className}`}
      aria-labelledby={labelledBy}
      aria-busy={!dismissible || undefined}
      onCancel={(event) => {
        event.preventDefault();
        if (dismissible) onDismiss();
      }}
      onClick={(event) => {
        if (!dismissible || event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
          event.clientY < bounds.top || event.clientY > bounds.bottom) {
          event.preventDefault();
          onDismiss();
        }
      }}
    >
      {children}
    </dialog>
  );
}
