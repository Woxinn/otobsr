"use client";

import React from "react";
import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";

type SubmitButtonProps = {
  children: React.ReactNode;
  className?: string;
  pendingLabel?: React.ReactNode;
  name?: string;
  value?: string;
  disabled?: boolean;
};

export default function SubmitButton({
  children,
  className,
  pendingLabel,
  name,
  value,
  disabled,
}: SubmitButtonProps) {
  const { pending, data } = useFormStatus();

  // If name/value are provided, check if this specific button triggered the submit.
  // Otherwise, fallback to checking general pending state.
  const isPending = pending && (!name || !value || data?.get(name) === value);

  return (
    <button
      type="submit"
      name={name}
      value={value}
      disabled={disabled || pending}
      className={className}
    >
      {isPending ? (
        <span className="flex items-center gap-1.5 justify-center">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {pendingLabel ?? children}
        </span>
      ) : (
        children
      )}
    </button>
  );
}
