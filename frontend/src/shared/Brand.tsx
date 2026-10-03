export function Brand({ className = "" }: { className?: string }) {
  return (
    <a className={`brand${className ? ` ${className}` : ""}`} href="/ui/preview" aria-label="Мой семестр — обзор">
      <svg className="brand-mark" viewBox="0 0 40 40" width="40" height="40" fill="none" aria-hidden="true">
        <rect x=".75" y=".75" width="38.5" height="38.5" rx="10" stroke="currentColor" strokeOpacity=".5" strokeWidth="1.5" />
        <path d="M11 28V19" stroke="var(--gold)" strokeWidth="5" strokeLinecap="round" />
        <path d="M20 28V11" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
        <path d="M29 28V15" stroke="#9acaba" strokeWidth="5" strokeLinecap="round" />
      </svg>
      <span className="brand-wordmark"><span>мой</span><span>семестр<span className="brand-period">.</span></span></span>
    </a>
  );
}
