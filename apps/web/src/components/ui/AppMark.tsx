export function AppMark({ size = "default" }: { size?: "default" | "small" }) {
  return (
    <span className={`app-mark ${size === "small" ? "small" : ""}`} aria-hidden="true">
      <svg className="app-mark-icon" viewBox="0 0 64 64" focusable="false" aria-hidden="true">
        <defs>
          <linearGradient id="app-mark-spectral" x1="10" x2="54" y1="14" y2="50" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#5f6fe5" />
            <stop offset="0.54" stopColor="#765bc8" />
            <stop offset="1" stopColor="#e66a3a" />
          </linearGradient>
        </defs>
        <path
          className="app-mark-frame"
          d="M10 16.5C10 13.46 12.46 11 15.5 11h33C51.54 11 54 13.46 54 16.5v31C54 50.54 51.54 53 48.5 53h-33C12.46 53 10 50.54 10 47.5v-31Z"
        />
        <path className="app-mark-band band-wide" d="M18 22h20v6H18z" />
        <path className="app-mark-band band-mid" d="M18 32h15v6H18z" />
        <path className="app-mark-band band-small" d="M18 42h10v5H18z" />
        <path className="app-mark-play" d="M39 27.2v19.6l12-9.8-12-9.8Z" />
      </svg>
    </span>
  );
}
