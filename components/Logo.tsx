"use client";

import { useState } from "react";

type LogoProps = {
  className?: string;
  alt?: string;
};

export default function Logo({ className, alt = "Logo" }: LogoProps) {
  const [src, setSrc] = useState("/logo.gif");
  return (
    <img
      src={src}
      alt={alt}
      className={className}
      loading="eager"
      decoding="async"
      onError={() => setSrc("/favicon.png")}
    />
  );
}
