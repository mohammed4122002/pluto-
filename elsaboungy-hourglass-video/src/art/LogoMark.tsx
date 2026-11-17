import { Img, staticFile } from "remotion";
import brand from "../config/brand.json";
import type { BrandConfig } from "../config/types";
import { FONT } from "../fonts";
import { T } from "../theme";

const B = brand as BrandConfig;

/**
 * The brand logo. When brand.json → logo.src points to the original file in
 * public/, it is drawn with object-fit: contain inside a fixed box, so it is
 * never stretched or recoloured. Until then a clearly labelled placeholder
 * wordmark is drawn.
 */
export const LogoMark: React.FC<{ width?: number; height?: number; style?: React.CSSProperties }> = ({
  width = B.logo.widthPx,
  height = B.logo.heightPx,
  style,
}) => {
  if (B.logo.src) {
    return (
      <div style={{ width, height, display: "flex", alignItems: "center", justifyContent: "center", ...style }}>
        <Img
          src={staticFile(B.logo.src)}
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            objectFit: "contain",
            filter: "drop-shadow(0 10px 18px rgba(4,20,60,0.35))",
          }}
        />
      </div>
    );
  }

  const size = Math.min(width / 4.4, height / 2.2);
  return (
    <div
      style={{
        width,
        height,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        ...style,
      }}
    >
      <div
        dir="rtl"
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: size,
          lineHeight: 1.2,
          color: "#fff",
          WebkitTextStroke: `${size * 0.1}px ${T.ink}`,
          paintOrder: "stroke fill",
          textShadow: `0 ${size * 0.08}px 0 ${T.yellow}, 0 ${size * 0.16}px 0 ${T.ink}`,
          whiteSpace: "nowrap",
        }}
      >
        {B.nameAr}
      </div>
      <div
        style={{
          fontFamily: FONT,
          fontWeight: 800,
          fontSize: size * 0.34,
          letterSpacing: size * 0.06,
          color: T.yellow,
          WebkitTextStroke: `${size * 0.035}px ${T.ink}`,
          paintOrder: "stroke fill",
          marginTop: size * 0.05,
        }}
      >
        {B.nameEn}
      </div>
      {B.logo.showPlaceholderTag && (
        <div
          style={{
            marginTop: size * 0.12,
            fontFamily: "sans-serif",
            fontSize: Math.max(16, size * 0.16),
            fontWeight: 700,
            color: "rgba(255,255,255,0.9)",
            background: "rgba(10,42,107,0.55)",
            border: "2px dashed rgba(255,255,255,0.75)",
            borderRadius: 10,
            padding: "2px 12px",
            letterSpacing: 1,
          }}
        >
          LOGO PLACEHOLDER
        </div>
      )}
    </div>
  );
};
