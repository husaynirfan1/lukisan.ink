"use client";
import { cn } from "../lib/utils";
import React, { ReactNode } from "react";

interface AuroraBackgroundProps extends React.HTMLProps<HTMLDivElement> {
  children: ReactNode;
  showRadialGradient?: boolean;
}

export const AuroraBackground = ({
  className,
  children,
  showRadialGradient = true,
  ...props
}: AuroraBackgroundProps) => {
  return (
    <div
      className={cn(
        "relative overflow-hidden min-h-screen bg-zinc-50 dark:bg-zinc-900 text-slate-950 transition-bg",
        className
      )}
      {...props}
    >
      {/* Aurora Background Layer */}
      <div
        aria-hidden
        className={cn(
          `
          absolute inset-0 z-0
          [--white-gradient:repeating-linear-gradient(100deg,white_0%,white_7%,transparent_10%,transparent_12%,white_16%)]
          [--dark-gradient:repeating-linear-gradient(100deg,black_0%,black_7%,transparent_10%,transparent_12%,black_16%)]
          [--aurora:repeating-linear-gradient(100deg,#93c5fd_10%,#c4b5fd_15%,#a5f3fc_20%,#d8b4fe_25%,#7dd3fc_30%)]
          [background-image:var(--white-gradient),var(--aurora)]
          dark:[background-image:var(--dark-gradient),var(--aurora)]
          [background-size:300%,_200%]
          [background-position:50%_50%,50%_50%]
          after:content-[""]
          after:absolute after:inset-0 
          after:[background-image:var(--white-gradient),var(--aurora)]
          after:dark:[background-image:var(--dark-gradient),var(--aurora)]
          after:[background-size:200%,_100%]
          after:animate-aurora after:[background-attachment:fixed]
          after:mix-blend-screen after:opacity-60
          pointer-events-none filter blur-[6px] saturate-[1.2]
          will-change-transform`,

          showRadialGradient &&
            `[mask-image:radial-gradient(ellipse_at_100%_0%,black_10%,transparent_70%)]`
        )}
      ></div>

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
};
