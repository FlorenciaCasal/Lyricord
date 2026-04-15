import { ImageResponse } from "next/og";

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = "image/png";

export default function OpenGraphImage() {
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
            "radial-gradient(circle at 50% 24%, rgba(34, 197, 94, 0.24), transparent 34%), #020617",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 390,
            height: 390,
            borderRadius: 86,
            border: "5px solid rgba(148, 163, 184, 0.26)",
            background: "#0f172a",
            boxShadow: "0 32px 120px rgba(0, 0, 0, 0.42)",
            alignItems: "center",
            justifyContent: "center",
            position: "relative",
          }}
        >
            <div
              style={{
                position: "absolute",
                top: 88,
                left: 72,
                right: 72,
                height: 5,
                borderRadius: 999,
                background: "rgba(148, 163, 184, 0.22)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 150,
                left: 72,
                right: 72,
                height: 5,
                borderRadius: 999,
                background: "rgba(148, 163, 184, 0.22)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 212,
                left: 72,
                right: 72,
                height: 5,
                borderRadius: 999,
                background: "rgba(148, 163, 184, 0.22)",
              }}
            />
            <div
              style={{
                display: "flex",
                color: "#22c55e",
                fontSize: 136,
                fontWeight: 800,
                letterSpacing: "-0.08em",
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
