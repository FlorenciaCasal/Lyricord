import { NextResponse } from "next/server";
import { sendPasswordResetEmail } from "@/lib/email";
import {
  createPasswordResetToken,
  getPasswordResetExpiresAt,
  getPasswordResetUrl,
  hashPasswordResetToken,
} from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const FORGOT_PASSWORD_RATE_LIMIT = 5;
const FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const GENERIC_RESPONSE = {
  message:
    "Si existe una cuenta con ese email, te enviamos instrucciones para restablecer la contraseña.",
};

type ForgotPasswordBody = {
  email?: string;
};

function getClientIp(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for");

  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() || "unknown";
  }

  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
}

export async function POST(request: Request) {
  try {
    const rateLimit = await checkRateLimit({
      type: "forgot-password",
      key: getClientIp(request),
      limit: FORGOT_PASSWORD_RATE_LIMIT,
      windowMs: FORGOT_PASSWORD_RATE_LIMIT_WINDOW_MS,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Recibimos demasiados pedidos. Probá de nuevo más tarde.",
        },
        { status: 429 },
      );
    }

    let body: ForgotPasswordBody;

    try {
      body = (await request.json()) as ForgotPasswordBody;
    } catch {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const email = String(body.email ?? "").trim().toLowerCase();

    if (!email || !EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
      },
    });

    if (!user) {
      return NextResponse.json(GENERIC_RESPONSE);
    }

    const token = createPasswordResetToken();
    const tokenHash = hashPasswordResetToken(token);
    const expiresAt = getPasswordResetExpiresAt();
    const resetUrl = getPasswordResetUrl(token);

    await prisma.$transaction([
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
      }),
      prisma.passwordResetToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt,
        },
      }),
    ]);

    const sent = await sendPasswordResetEmail({
      to: user.email,
      resetUrl,
    });

    if (!sent) {
      console.error("Forgot password API: no pudimos enviar el email.", {
        userId: user.id,
      });
    }

    return NextResponse.json(GENERIC_RESPONSE);
  } catch (error) {
    console.error("Forgot password API: error inesperado.", { error });
    return NextResponse.json(GENERIC_RESPONSE);
  }
}
