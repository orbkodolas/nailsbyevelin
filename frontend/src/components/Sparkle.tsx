// A márka csillogás-jele (négyágú csillag), több helyen használva
export function Sparkle({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M12 0c.9 6.6 4.4 10.1 12 12-7.6 1.9-11.1 5.4-12 12-.9-6.6-4.4-10.1-12-12C7.6 10.1 11.1 6.6 12 0z" fill="currentColor" />
    </svg>
  )
}
