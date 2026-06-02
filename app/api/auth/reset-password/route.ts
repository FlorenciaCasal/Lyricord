import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import {
  hashPasswordResetToken,
  isValidPasswordLength,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@/lib/password-reset";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const RESET_PASSWORD_RATE_LIMIT = 10;
const RESET_PASSWORD_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;

type ResetPasswordBody = {
  token?: string;
  password?: string;
  confirmPassword?: string;
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
      type: "reset-password",
      key: getClientIp(request),
      limit: RESET_PASSWORD_RATE_LIMIT,
      windowMs: RESET_PASSWORD_RATE_LIMIT_WINDOW_MS,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Recibimos demasiados intentos. Probá de nuevo más tarde.",
        },
        { status: 429 },
      );
    }

    let body: ResetPasswordBody;

    try {
      body = (await request.json()) as ResetPasswordBody;
    } catch {
      return NextResponse.json(
        { error: "El pedido no tiene un formato válido." },
        { status: 400 },
      );
    }

    const token = String(body.token ?? "");
    const password = String(body.password ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");

    if (!token || !password || !confirmPassword) {
      return NextResponse.json(
        { error: "Completá todos los campos." },
        { status: 400 },
      );
    }

    if (!isValidPasswordLength(password)) {
      return NextResponse.json(
        {
          error: `La contraseña debe tener entre ${MIN_PASSWORD_LENGTH} y ${MAX_PASSWORD_LENGTH} caracteres.`,
        },
        { status: 400 },
      );
    }

    if (password !== confirmPassword) {
      return NextResponse.json(
        { error: "Las contraseñas no coinciden." },
        { status: 400 },
      );
    }

    const tokenHash = hashPasswordResetToken(token);

    const passwordResetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      select: {
        id: true,
        userId: true,
        expiresAt: true,
        usedAt: true,
      },
    });

    if (
      !passwordResetToken ||
      passwordResetToken.usedAt ||
      passwordResetToken.expiresAt <= new Date()
    ) {
      return NextResponse.json(
        {
          error:
            "El link de recuperación no es válido o ya venció. Pedí uno nuevo.",
        },
        { status: 400 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const now = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: passwordResetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: passwordResetToken.id },
        data: { usedAt: now },
      }),
      prisma.passwordResetToken.deleteMany({
        where: {
          userId: passwordResetToken.userId,
          id: {
            not: passwordResetToken.id,
          },
        },
      }),
    ]);

    return NextResponse.json({
      message: "Contraseña actualizada. Ya podés iniciar sesión.",
    });
  } catch (error) {
    console.error("Reset password API: error inesperado.", { error });

    return NextResponse.json(
      { error: "No pudimos actualizar la contraseña. Intentá de nuevo." },
      { status: 500 },
    );
  }
}
