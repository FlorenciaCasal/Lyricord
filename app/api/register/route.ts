import { Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const REGISTER_RATE_LIMIT = 5;
const REGISTER_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 128;

type RegisterBody = {
  email?: string;
  password?: string;
  confirmPassword?: string;
  acceptTerms?: boolean;
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
      type: "register",
      key: getClientIp(request),
      limit: REGISTER_RATE_LIMIT,
      windowMs: REGISTER_RATE_LIMIT_WINDOW_MS,
    });

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          error:
            "Demasiados intentos de registro desde esta conexion. Proba de nuevo mas tarde.",
        },
        { status: 429 },
      );
    }

    let body: RegisterBody;

    try {
      body = (await request.json()) as RegisterBody;
    } catch {
      return NextResponse.json(
        { error: "El pedido no tiene un formato valido." },
        { status: 400 },
      );
    }

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const confirmPassword = String(body.confirmPassword ?? "");
    const acceptTerms = body.acceptTerms === true;

    if (!email || !password || !confirmPassword) {
      return NextResponse.json(
        { error: "Completa todos los campos." },
        { status: 400 },
      );
    }

    if (!EMAIL_PATTERN.test(email) || email.length > MAX_EMAIL_LENGTH) {
      return NextResponse.json(
        { error: "Ingresa un email valido." },
        { status: 400 },
      );
    }

    if (!acceptTerms) {
      return NextResponse.json(
        { error: "Tenes que aceptar los términos para crear una cuenta." },
        { status: 400 },
      );
    }

    if (
      password.length < MIN_PASSWORD_LENGTH ||
      password.length > MAX_PASSWORD_LENGTH
    ) {
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

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con ese email." },
        { status: 409 },
      );
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.create({
      data: {
        email,
        passwordHash,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return NextResponse.json(
        { error: "Ya existe una cuenta con ese email." },
        { status: 409 },
      );
    }

    console.error("Register API: no pudimos crear la cuenta.", { error });

    return NextResponse.json(
      { error: "No pudimos crear la cuenta. Intenta de nuevo." },
      { status: 500 },
    );
  }
}
