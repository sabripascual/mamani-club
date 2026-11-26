"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * <img> que aparece recién cuando terminó de cargar. Con poca señal el navegador
 * pinta las fotos de a pedazos y se ven "cortadas"; así se ve el fondo hasta que
 * está completa. Las URLs son firmadas de un bucket privado (por eso no next/image).
 */
export function FadeImg({ className, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
  const ref = useRef<HTMLImageElement>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    // Si ya estaba en caché, onLoad puede haber pasado antes de hidratar.
    if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true);
  }, [props.src]);
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text -- URL firmada; alt viene en props
    <img
      ref={ref}
      decoding="async"
      {...props}
      onLoad={(e) => { setLoaded(true); props.onLoad?.(e); }}
      className={cn("transition-opacity duration-300", loaded ? "opacity-100" : "opacity-0", className)}
    />
  );
}
