import { ImageAnnotatorClient } from "@google-cloud/vision";

let client: ImageAnnotatorClient | null = null;

type Vertex = {
  x?: number | null;
  y?: number | null;
};

type BoundingPoly = {
  vertices?: Vertex[] | null;
};

type DetectedBreak = {
  type?: string | null;
};

type SymbolAnnotation = {
  text?: string | null;
  property?: {
    detectedBreak?: DetectedBreak | null;
  } | null;
};

type WordAnnotation = {
  symbols?: SymbolAnnotation[] | null;
  boundingBox?: BoundingPoly | null;
};

type ParagraphAnnotation = {
  words?: WordAnnotation[] | null;
};

type BlockAnnotation = {
  paragraphs?: ParagraphAnnotation[] | null;
};

type PageAnnotation = {
  blocks?: BlockAnnotation[] | null;
};

type FullTextAnnotation = {
  text?: string | null;
  pages?: PageAnnotation[] | null;
};

type PositionedWord = {
  text: string;
  left: number;
  right: number;
  top: number;
  bottom: number;
  centerY: number;
  width: number;
  height: number;
};

type ReconstructedLine = {
  words: PositionedWord[];
  centerY: number;
  averageHeight: number;
  top: number;
  bottom: number;
  type: "chords" | "lyrics";
};

type ServiceAccountCredentials = {
  client_email?: string;
  private_key?: string;
  project_id?: string;
};

function getGoogleVisionCredentials() {
  const rawCredentials =
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ??
    process.env.GOOGLE_CREDENTIALS_JSON ??
    "";

  if (!rawCredentials) {
    return null;
  }

  try {
    const parsedCredentials = JSON.parse(
      rawCredentials,
    ) as ServiceAccountCredentials;

    if (!parsedCredentials.client_email || !parsedCredentials.private_key) {
      return null;
    }

    return {
      client_email: parsedCredentials.client_email,
      private_key: parsedCredentials.private_key.replace(/\\n/g, "\n"),
      project_id:
        parsedCredentials.project_id ?? process.env.GOOGLE_CLOUD_PROJECT ?? "",
    };
  } catch (error) {
    console.error("Google Vision OCR: no pudimos parsear las credenciales JSON.", {
      error,
    });
    return null;
  }
}

function getVisionClient() {
  if (!client) {
    const credentials = getGoogleVisionCredentials();

    client = credentials
      ? new ImageAnnotatorClient({
          credentials: {
            client_email: credentials.client_email,
            private_key: credentials.private_key,
          },
          projectId: credentials.project_id || process.env.GOOGLE_CLOUD_PROJECT,
        })
      : new ImageAnnotatorClient();
  }

  return client;
}

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function getSafeErrorDetail(error: unknown) {
  if (!isDevelopment()) {
    return undefined;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Error no identificado al invocar Google Cloud Vision.";
}

function getFriendlyErrorMessage(detail?: string) {
  if (!detail) {
    return "Falló la lectura OCR con Google Cloud Vision.";
  }

  return `Falló la lectura OCR con Google Cloud Vision. Detalle: ${detail}`;
}

function getBoundingMetrics(boundingBox?: BoundingPoly | null) {
  const vertices = boundingBox?.vertices?.filter(
    (vertex): vertex is Vertex => Boolean(vertex),
  );

  if (!vertices || vertices.length === 0) {
    return null;
  }

  const xs = vertices
    .map((vertex) => vertex.x ?? 0)
    .filter((value) => Number.isFinite(value));
  const ys = vertices
    .map((vertex) => vertex.y ?? 0)
    .filter((value) => Number.isFinite(value));

  if (xs.length === 0 || ys.length === 0) {
    return null;
  }

  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);

  return {
    left,
    right,
    top,
    bottom,
    width: Math.max(1, right - left),
    height: Math.max(1, bottom - top),
    centerY: (top + bottom) / 2,
  };
}

function getWordText(word: WordAnnotation) {
  const symbols = word.symbols ?? [];
  const text = symbols.map((symbol) => symbol.text ?? "").join("").trim();

  if (!text) {
    return "";
  }

  const trailingBreak = symbols.at(-1)?.property?.detectedBreak?.type;

  if (trailingBreak === "HYPHEN") {
    return `${text}-`;
  }

  return text;
}

function extractPositionedWords(fullTextAnnotation?: FullTextAnnotation | null) {
  const positionedWords: PositionedWord[] = [];

  for (const page of fullTextAnnotation?.pages ?? []) {
    for (const block of page.blocks ?? []) {
      for (const paragraph of block.paragraphs ?? []) {
        for (const word of paragraph.words ?? []) {
          const text = getWordText(word);
          const metrics = getBoundingMetrics(word.boundingBox);

          if (!text || !metrics) {
            continue;
          }

          positionedWords.push({
            text,
            ...metrics,
          });
        }
      }
    }
  }

  return positionedWords;
}

function groupWordsIntoLines(words: PositionedWord[]) {
  const sortedWords = [...words].sort((a, b) => {
    if (Math.abs(a.centerY - b.centerY) > 1) {
      return a.centerY - b.centerY;
    }

    return a.left - b.left;
  });

  const lines: ReconstructedLine[] = [];

  for (const word of sortedWords) {
    const targetLine = lines.find((line) => {
      const threshold = Math.max(
        8,
        Math.min(line.averageHeight, word.height) * 0.65,
      );

      return Math.abs(line.centerY - word.centerY) <= threshold;
    });

    if (!targetLine) {
      lines.push({
        words: [word],
        centerY: word.centerY,
        averageHeight: word.height,
        top: word.top,
        bottom: word.bottom,
        type: "lyrics",
      });
      continue;
    }

    targetLine.words.push(word);
    targetLine.words.sort((a, b) => a.left - b.left);
    targetLine.centerY =
      targetLine.words.reduce((sum, item) => sum + item.centerY, 0) /
      targetLine.words.length;
    targetLine.averageHeight =
      targetLine.words.reduce((sum, item) => sum + item.height, 0) /
      targetLine.words.length;
    targetLine.top = Math.min(targetLine.top, word.top);
    targetLine.bottom = Math.max(targetLine.bottom, word.bottom);
  }

  return lines.sort((a, b) => a.centerY - b.centerY);
}

function getMedian(values: number[]) {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const middleIndex = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[middleIndex - 1] + sorted[middleIndex]) / 2;
  }

  return sorted[middleIndex];
}

function normalizeChordToken(token: string) {
  return token
    .trim()
    .replace(/[()[\]{}.,;:¡!¿?"'`~]/g, "")
    .replace(/-/g, "")
    .toUpperCase();
}

function looksLikeChordToken(token: string) {
  const normalized = normalizeChordToken(token);

  if (!normalized) {
    return false;
  }

  if (splitMergedSimpleChords(normalized) !== normalized) {
    return true;
  }

  const latinRoot = "(?:A|B|C|D|E|F|G|DO|RE|MI|FA|SOL|LA|SI)";
  const accidental = "(?:#|B)?";
  const quality =
    "(?:M|MAJ|MIN|MI|M7|M9|M11|M13|SUS|SUS2|SUS4|ADD|DIM|AUG|OMIT)?";
  const extension = "(?:[0-9]{0,2})?";
  const bass = `(?:\\/(?:${latinRoot})${accidental})?`;
  const chordPattern = new RegExp(
    `^${latinRoot}${accidental}${quality}${extension}${bass}$`,
    "i",
  );

  return chordPattern.test(normalized) && normalized.length <= 12;
}

function detectLineType(words: PositionedWord[]) {
  const tokens = words
    .map((word) => word.text.trim())
    .filter((token) => token.length > 0);

  if (tokens.length === 0) {
    return "lyrics" as const;
  }

  const chordLikeCount = tokens.filter(looksLikeChordToken).length;
  const shortTokenCount = tokens.filter((token) => token.length <= 6).length;
  const chordRatio = chordLikeCount / tokens.length;
  const shortRatio = shortTokenCount / tokens.length;

  if (chordRatio >= 0.6 && shortRatio >= 0.6) {
    return "chords" as const;
  }

  return "lyrics" as const;
}

function splitMergedSimpleChords(token: string) {
  const match = token.match(/^([([{]?)([A-G](?:#|b)?[A-G](?:#|b)?[A-G]?(?:#|b)?)([)\]}.,;:]?)$/);

  if (!match) {
    return token;
  }

  const [, prefix, chordSequence, suffix] = match;
  const roots = chordSequence.match(/[A-G](?:#|b)?/g) ?? [];

  if (roots.length < 2 || roots.join("") !== chordSequence) {
    return token;
  }

  return `${prefix}${roots.join(" ")}${suffix}`;
}

function normalizeWordForLineType(word: PositionedWord, lineType: ReconstructedLine["type"]) {
  if (lineType !== "chords") {
    return word.text;
  }

  return splitMergedSimpleChords(word.text);
}

function buildLineText(
  words: PositionedWord[],
  charWidth: number,
  lineType: ReconstructedLine["type"],
) {
  if (words.length === 0) {
    return "";
  }

  let cursor = words[0].left;
  let renderedLine = "";

  for (const word of words) {
    const wordText = normalizeWordForLineType(word, lineType);
    const gap = Math.max(0, word.left - cursor);
    const spaces =
      renderedLine.length === 0
        ? 0
        : Math.max(1, Math.round(gap / Math.max(charWidth, 1)));

    if (spaces > 0) {
      renderedLine += " ".repeat(spaces);
    }

    renderedLine += wordText;

    const estimatedWordWidth = Math.max(word.width, wordText.length * charWidth);
    cursor = word.left + estimatedWordWidth;
  }

  return renderedLine.replace(/\s+$/g, "");
}

function reconstructStructuredText(
  fullTextAnnotation?: FullTextAnnotation | null,
) {
  const words = extractPositionedWords(fullTextAnnotation);

  if (words.length === 0) {
    return "";
  }

  const lines = groupWordsIntoLines(words).map((line) => ({
    ...line,
    type: detectLineType(line.words),
  }));

  const perCharWidths = words
    .filter((word) => word.text.length > 0)
    .map((word) => word.width / word.text.length)
    .filter((value) => Number.isFinite(value) && value > 0);

  const charWidth = Math.max(4, getMedian(perCharWidths) || 7);
  const renderedLines: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const currentLine = lines[index];
    const renderedLine = buildLineText(
      currentLine.words,
      charWidth,
      currentLine.type,
    );

    if (renderedLine) {
      renderedLines.push(renderedLine);
    }

    const nextLine = lines[index + 1];

    if (!nextLine) {
      continue;
    }

    const verticalGap = nextLine.top - currentLine.bottom;
    const referenceHeight = Math.max(
      currentLine.averageHeight,
      nextLine.averageHeight,
      1,
    );

    if (verticalGap > referenceHeight * 1.6) {
      renderedLines.push("");
      continue;
    }

    if (
      currentLine.type === "chords" &&
      nextLine.type === "lyrics" &&
      verticalGap <= referenceHeight * 1.1
    ) {
      continue;
    }
  }

  return renderedLines.join("\n").trim();
}

export type OcrExtractionResult =
  | {
      success: true;
      text: string;
    }
  | {
      success: false;
      error: string;
    };

export async function extractTextFromImage(
  image: File,
): Promise<OcrExtractionResult> {
  const hasCredentialsPath = Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS);
  const hasCredentialsJson = Boolean(
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ??
      process.env.GOOGLE_CREDENTIALS_JSON,
  );

  const missingEnvVars = [
    !hasCredentialsPath && !hasCredentialsJson
      ? "GOOGLE_APPLICATION_CREDENTIALS o GOOGLE_APPLICATION_CREDENTIALS_JSON"
      : null,
    !process.env.GOOGLE_CLOUD_PROJECT ? "GOOGLE_CLOUD_PROJECT" : null,
  ].filter(Boolean);

  if (missingEnvVars.length > 0) {
    console.error("Google Vision OCR: faltan variables de entorno.", {
      missingEnvVars,
      hasCredentialsPath,
      hasCredentialsJson,
    });

    return {
      success: false,
      error: getFriendlyErrorMessage(
        isDevelopment()
          ? `Configuración incompleta: faltan ${missingEnvVars.join(", ")}.`
          : undefined,
      ),
    };
  }

  if (image.size === 0) {
    console.error("Google Vision OCR: imagen vacía.", {
      fileName: image.name,
    });

    return {
      success: false,
      error: "La imagen está vacía.",
    };
  }

  try {
    const buffer = Buffer.from(await image.arrayBuffer());
    const [result] = await getVisionClient().documentTextDetection({
      image: {
        content: buffer,
      },
      imageContext: {
        languageHints: ["es", "en"],
      },
    });

    const plainText =
      result.fullTextAnnotation?.text?.trim() ??
      result.textAnnotations?.[0]?.description?.trim() ??
      "";

    const reconstructedText = reconstructStructuredText(
      result.fullTextAnnotation as FullTextAnnotation | null | undefined,
    );

    const text = reconstructedText || plainText;

    if (!text) {
      console.error("Google Vision OCR: respuesta sin texto detectable.", {
        fileName: image.name,
        fileType: image.type,
        fileSize: image.size,
      });

      return {
        success: false,
        error: "No pudimos detectar texto en la imagen.",
      };
    }

    if (!reconstructedText && plainText) {
      console.warn("Google Vision OCR: fallback a texto plano.", {
        fileName: image.name,
      });
    }

    return {
      success: true,
      text,
    };
  } catch (error) {
    console.error("Google Vision OCR: error al procesar imagen.", {
      fileName: image.name,
      fileType: image.type,
      fileSize: image.size,
      error,
    });

    return {
      success: false,
      error: getFriendlyErrorMessage(getSafeErrorDetail(error)),
    };
  }
}
