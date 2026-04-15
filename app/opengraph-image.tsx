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
          background: "#020617",
          color: "#f8fafc",
        }}
      >
        <div
          style={{
            display: "flex",
            width: "100%",
            height: "100%",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "76px 96px",
            background:
              "radial-gradient(circle at 16% 18%, rgba(34, 197, 94, 0.24), transparent 28%), linear-gradient(135deg, #020617 0%, #0f172a 52%, #101827 100%)",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 28,
              maxWidth: 610,
            }}
          >
            <div
              style={{
                display: "flex",
                color: "#22c55e",
                fontSize: 36,
                fontWeight: 700,
              }}
            >
              Lyricord
            </div>
            <div
              style={{
                display: "flex",
                fontSize: 76,
                lineHeight: 0.98,
                fontWeight: 800,
              }}
            >
              Letras y acordes listos para tocar
            </div>
            <div
              style={{
                display: "flex",
                color: "#cbd5e1",
                fontSize: 34,
                lineHeight: 1.35,
              }}
            >
              Guarda, edita e importa canciones con OCR.
            </div>
          </div>

          <div
            style={{
              display: "flex",
              width: 330,
              height: 330,
              borderRadius: 72,
              border: "4px solid rgba(148, 163, 184, 0.26)",
              background: "#0f172a",
              boxShadow: "0 28px 90px rgba(0, 0, 0, 0.38)",
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
                height: 4,
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
                height: 4,
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
                height: 4,
                borderRadius: 999,
                background: "rgba(148, 163, 184, 0.22)",
              }}
            />
            <div
              style={{
                display: "flex",
                color: "#22c55e",
                fontSize: 108,
                fontWeight: 800,
              }}
            >
              Ly
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
