import React from "react";
import { cn } from "@/lib/utils";

interface AuroraBackgroundProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export const AuroraBackground: React.FC<AuroraBackgroundProps> = ({ children, className, ...props }) => {
  return (
    <div
      className={cn("relative w-full overflow-visible", className)}
      {...props}
    >
      {/* Aurora Light Blur */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden="true"
      >
        {/* Large radial blur background gradient */}
        <div className="absolute -top-32 left-1/2 w-[1200px] h-[1200px] -translate-x-1/2 rounded-full bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-purple-500 via-indigo-500 to-transparent opacity-40 blur-3xl" />
      </div>

      {/* Foreground children */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  );
};
