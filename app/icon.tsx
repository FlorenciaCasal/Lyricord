import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top, rgba(34, 197, 94, 0.22), transparent 38%), #020617",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 392,
            height: 392,
            borderRadius: 96,
            border: "4px solid rgba(148, 163, 184, 0.26)",
            background: "#0f172a",
            boxShadow: "0 24px 80px rgba(0, 0, 0, 0.35)",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: 66,
              left: 78,
              right: 78,
              height: 4,
              background: "rgba(148, 163, 184, 0.22)",
              borderRadius: 999,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 124,
              left: 78,
              right: 78,
              height: 4,
              background: "rgba(148, 163, 184, 0.22)",
              borderRadius: 999,
            }}
          />
          <div
            style={{
              position: "absolute",
              top: 182,
              left: 78,
              right: 78,
              height: 4,
              background: "rgba(148, 163, 184, 0.22)",
              borderRadius: 999,
            }}
          />
          <div
            style={{
              display: "flex",
              fontSize: 118,
              fontWeight: 700,
              color: "#22c55e",
              letterSpacing: "-0.12em",
              transform: "translateY(-2px)",
            }}
          >
            Ly
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
