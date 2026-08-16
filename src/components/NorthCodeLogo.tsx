export function NorthCodeLogo({ className = "h-8 w-auto" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`} id="northcode-brand-logo">
      <div className="relative flex items-center justify-center w-10 h-10 rounded-full border-2 border-white bg-black">
        <svg
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-5 h-5 text-white"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path d="M13 2L4 13.5H11L10 22L20 9.5H13L13 2Z" stroke="white" strokeWidth="1" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="flex flex-col">
        <span className="text-xl font-bold tracking-tight text-white font-sans">
          North<span className="font-semibold text-neutral-300">Code</span>
          <span className="ml-1.5 text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            ZAP
          </span>
        </span>
      </div>
    </div>
  );
}
