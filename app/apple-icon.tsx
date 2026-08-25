import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: "#020617",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 136,
            height: 136,
            borderRadius: 34,
            border: "2px solid rgba(148, 163, 184, 0.26)",
            background: "#0f172a",
            alignItems: "center",
            justifyContent: "center",
            color: "#22c55e",
            fontSize: 62,
            fontWeight: 700,
            letterSpacing: "-0.12em",
          }}
        >
          M
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
