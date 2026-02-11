"use client";

import type { ReactNode } from "react";
import { useRef, useState } from "react";

type ConfirmActionFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  confirmText: string;
  buttonText: string;
  className?: string;
  buttonClassName?: string;
  formId?: string;
  children?: ReactNode;
};

export default function ConfirmActionForm({
  action,
  confirmText,
  buttonText,
  className,
  buttonClassName,
  formId,
  children,
}: ConfirmActionFormProps) {
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement | null>(null);

  const handleConfirm = () => {
    setOpen(false);
    formRef.current?.requestSubmit();
  };

  return (
    <>
      <form action={action} ref={formRef} className={className} id={formId}>
      {children}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={
          buttonClassName ??
          "rounded-full border border-red-200 bg-red-50 px-4 py-2 text-sm font-semibold text-red-600 transition hover:-translate-y-0.5 hover:shadow-[0_12px_24px_-18px_rgba(185,28,28,0.6)]"
        }
      >
        {buttonText}
      </button>
      </form>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-3xl border border-white/20 bg-[linear-gradient(135deg,#0f3d3e,#1f5f62,#ce7a3a)] p-[1px] shadow-[0_30px_60px_-30px_rgba(15,61,62,0.7)]">
            <div className="rounded-[22px] bg-white p-6">
              <p className="text-xs uppercase tracking-[0.3em] text-black/40">
                Onay
              </p>
              <h4 className="mt-2 text-lg font-semibold text-black">
                {confirmText}
              </h4>
              <p className="mt-2 text-sm text-black/60">
                Bu islem geri alinamaz.
              </p>
              <div className="mt-6 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black/60"
                >
                  Vazgec
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="rounded-full bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_12px_24px_-18px_rgba(185,28,28,0.7)]"
                >
                  Sil
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
