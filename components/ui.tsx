import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-white">{title}</h1>
        <p className="mt-1 max-w-2xl text-sm text-slate-400">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function Card({
  children,
  className
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={cn("rounded border border-line bg-panel shadow-sm", className)}>{children}</section>;
}

export function StatusPill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "cyan" | "purple" | "emerald" | "amber" | "rose" | "slate" }) {
  const tones = {
    cyan: "border-[#C89B3C]/30 bg-[#C89B3C]/10 text-[#F1D48A]",
    purple: "border-[#7C3AED]/30 bg-[#7C3AED]/10 text-[#C4B5FD]",
    emerald: "border-[#22C55E]/30 bg-[#22C55E]/10 text-[#86EFAC]",
    amber: "border-[#0EA5E9]/30 bg-[#0EA5E9]/10 text-[#7DD3FC]",
    rose: "border-[#DC2626]/30 bg-[#DC2626]/10 text-[#FCA5A5]",
    slate: "border-slate-500/30 bg-slate-500/10 text-slate-300"
  };

  return <span className={cn("inline-flex rounded border px-2 py-0.5 text-xs font-medium", tones[tone])}>{children}</span>;
}

export function Button({
  children,
  className,
  variant = "primary",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary";
}) {
  return (
    <button
      className={cn(
        "inline-flex h-9 items-center justify-center gap-2 rounded px-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" && "bg-[#C89B3C] text-[#0F1115] hover:bg-[#D4A64A]",
        variant === "secondary" && "border border-line bg-white/[0.03] text-slate-200 hover:bg-white/[0.06]",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export const inputClass =
  "h-10 w-full rounded border border-line bg-[#0F1115] px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-[#C89B3C]/70 focus:ring-2 focus:ring-[#C89B3C]/10";
