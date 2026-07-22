export const WVO_LOGO_TRANSPARENT_PATH = "/brand/WVO-logo-transparent.webp";
export const WVO_LOGO_WHITE_TRANSPARENT_PATH = "/brand/WVO-logo-white-transparent.webp";

export function AppMark({ size = "default" }: { size?: "default" | "small" }) {
  return (
    <span className={`app-mark ${size === "small" ? "small" : "default"}`} aria-hidden="true">
      <img className="app-mark-image app-mark-image-dark" src={WVO_LOGO_TRANSPARENT_PATH} alt="" draggable={false} />
      <img
        className="app-mark-image app-mark-image-white"
        src={WVO_LOGO_WHITE_TRANSPARENT_PATH}
        alt=""
        draggable={false}
      />
    </span>
  );
}
