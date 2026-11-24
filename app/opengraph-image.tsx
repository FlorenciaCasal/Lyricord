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
          gap: 72,
          padding: "70px 86px",
          background:
            "radial-gradient(circle at 24% 20%, rgba(132, 204, 22, 0.22), transparent 38%), #020617",
        }}
      >
        <div
          style={{
            display: "flex",
            width: 330,
            height: 330,
            borderRadius: 76,
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
                top: 74,
                left: 60,
                right: 60,
                height: 5,
                borderRadius: 999,
                background: "rgba(148, 163, 184, 0.22)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 126,
                left: 60,
                right: 60,
                height: 5,
                borderRadius: 999,
                background: "rgba(148, 163, 184, 0.22)",
              }}
            />
            <div
              style={{
                position: "absolute",
                top: 178,
                left: 60,
                right: 60,
                height: 5,
                borderRadius: 999,
                background: "rgba(148, 163, 184, 0.22)",
              }}
            />
            <div
              style={{
                display: "flex",
                color: "#22c55e",
                fontSize: 116,
                fontWeight: 800,
                letterSpacing: "-0.08em",
                transform: "translateY(-2px)",
              }}
            >
              M
            </div>
          </div>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            maxWidth: 610,
          }}
        >
          <div
            style={{
              color: "#84cc16",
              fontSize: 30,
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Musum
          </div>
          <div
            style={{
              marginTop: 18,
              color: "#f8fafc",
              fontSize: 72,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: "-0.05em",
            }}
          >
            Tus canciones, siempre con vos.
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
