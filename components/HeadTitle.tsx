"use client";

import { useEffect } from "react";

type Props = { title: string };

export default function HeadTitle({ title }: Props) {
  useEffect(() => {
    if (title) document.title = title;
  }, [title]);
  return null;
}

