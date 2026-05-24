import { cn } from "@/lib/utils";

export function HermesLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("h-8 w-8", className)}
      aria-hidden
    >
      <rect width="32" height="32" rx="8" className="fill-primary/20" />
      <path
        d="M8 18.5C10.5 14 13 11.5 16 10c3 1.5 5.5 4 8 8.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        className="text-primary"
      />
      <path
        d="M6 20.5c3-2.5 6.5-4 10-4s7 1.5 10 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        className="text-primary/70"
      />
      <path
        d="M10 12.5 16 8l6 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
      />
    </svg>
  );
}
