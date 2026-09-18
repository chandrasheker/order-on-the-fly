import Image from "next/image";
import { cn } from "@/lib/utils";

export function BrowserFrame({
  src,
  alt,
  width,
  height,
  caption,
  className,
  priority,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <figure className={cn("min-w-0", className)}>
      <div className="rounded-2xl border border-white/10 bg-[#0b0d14] shadow-[0_24px_80px_rgba(0,0,0,0.45)] overflow-hidden">
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-white/8 bg-white/5">
          <span className="size-2 rounded-full bg-zinc-600" aria-hidden />
          <span className="size-2 rounded-full bg-zinc-600" aria-hidden />
          <span className="size-2 rounded-full bg-zinc-600" aria-hidden />
          <span className="ml-3 h-5 flex-1 rounded-md bg-black/40 text-[10px] text-zinc-500 px-2 flex items-center truncate">
            TableTap
          </span>
        </div>
        <div className="relative bg-black">
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            className="w-full h-auto"
            sizes="(max-width: 768px) 100vw, 720px"
            priority={priority}
          />
        </div>
      </div>
      {caption ? (
        <figcaption className="mt-3 text-sm text-zinc-400 leading-relaxed">{caption}</figcaption>
      ) : null}
    </figure>
  );
}

export function PhoneFrame({
  src,
  alt,
  width,
  height,
  caption,
  className,
  priority,
}: {
  src: string;
  alt: string;
  width: number;
  height: number;
  caption?: string;
  className?: string;
  priority?: boolean;
}) {
  return (
    <figure className={cn("min-w-0 mx-auto", className)}>
      <div className="relative mx-auto w-[min(100%,18rem)] rounded-[2rem] border border-white/15 bg-black p-2 shadow-[0_30px_80px_rgba(0,0,0,0.5)]">
        <div className="absolute top-3 left-1/2 -translate-x-1/2 h-4 w-20 rounded-full bg-black z-10" aria-hidden />
        <div className="overflow-hidden rounded-[1.55rem] bg-black">
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            className="w-full h-auto"
            sizes="288px"
            priority={priority}
          />
        </div>
      </div>
      {caption ? (
        <figcaption className="mt-3 text-sm text-zinc-400 text-center leading-relaxed">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
