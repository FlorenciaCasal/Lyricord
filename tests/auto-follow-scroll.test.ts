import assert from "node:assert/strict";
import test from "node:test";
import { decideAutoFollowScroll } from "../mobile/src/music/autoFollowScroll.ts";

const baseState = {
  lastScrolledLineIndex: 4,
  lastAutomaticScrollY: 100,
  currentScrollY: 100,
  viewportHeight: 600,
  animationInProgress: false,
  layoutReady: true,
  layoutValid: true,
};

test("misma linea no hace scroll", () => {
  const decision = decideAutoFollowScroll(baseState, { targetLineIndex: 4, targetLineY: 480, timelineIndex: 10 });

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "same-line");
});

test("duplicate target no hace scroll", () => {
  const decision = decideAutoFollowScroll(baseState, { targetLineIndex: 5, targetLineY: 90, timelineIndex: 11 });

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "duplicate");
});

test("no retrocede", () => {
  const decision = decideAutoFollowScroll(baseState, { targetLineIndex: 3, targetLineY: 700, timelineIndex: 8 });

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "backwards");
});

test("safe viewport zone no mueve innecesariamente", () => {
  const decision = decideAutoFollowScroll(baseState, { targetLineIndex: 5, targetLineY: 430, timelineIndex: 11 });

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "safe-zone");
});

test("animation-in-progress evita animaciones superpuestas", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, animationInProgress: true },
    { targetLineIndex: 5, targetLineY: 570, timelineIndex: 11 },
  );

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "animation-in-progress");
});

test("avances fuera de la zona segura hacen scroll hacia adelante", () => {
  const decision = decideAutoFollowScroll(baseState, { targetLineIndex: 5, targetLineY: 570, timelineIndex: 11 });

  assert.equal(decision.shouldScroll, true);
  assert.equal(decision.reason, "advanced");
  assert.equal(decision.fromLine, 4);
  assert.equal(decision.toLine, 5);
});

test("nunca pide scroll automatico hacia atras", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastAutomaticScrollY: 420, currentScrollY: 420 },
    { targetLineIndex: 5, targetLineY: 520, timelineIndex: 11 },
  );

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "safe-zone");
});

test("mismo target vertical no hace micro-scroll", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastAutomaticScrollY: 360, currentScrollY: 100 },
    { targetLineIndex: 6, targetLineY: 570, timelineIndex: 12 },
  );

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "non-forward-target");
});

test("linea visible no scrollea aunque haya avance", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 1, lastAutomaticScrollY: 0, currentScrollY: 300 },
    { targetLineIndex: 8, targetLineY: 640, timelineIndex: 20 },
  );

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "safe-zone");
});

test("linea entrando en zona baja scrollea una sola vez hacia adelante", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 1, lastAutomaticScrollY: 0, currentScrollY: 300 },
    { targetLineIndex: 8, targetLineY: 760, timelineIndex: 20 },
  );

  assert.equal(decision.shouldScroll, true);
  assert.equal(decision.reason, "advanced");
  assert.ok(decision.targetY > 300);
});

test("coordenadas: current 0 target 300 no scrollea", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 0, lastAutomaticScrollY: 0, currentScrollY: 0, viewportHeight: 600 },
    { targetLineIndex: 1, targetLineY: 300, timelineIndex: 1 },
  );

  assert.equal(decision.evaluation.targetVisibleY, 300);
  assert.equal(decision.evaluation.safeZoneBottom, 420);
  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "safe-zone");
});

test("coordenadas: current 0 target 550 scrollea", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 0, lastAutomaticScrollY: 0, currentScrollY: 0, viewportHeight: 600 },
    { targetLineIndex: 1, targetLineY: 550, timelineIndex: 1 },
  );

  assert.equal(decision.evaluation.targetVisibleY, 550);
  assert.equal(decision.shouldScroll, true);
  assert.equal(decision.reason, "advanced");
  assert.equal(decision.targetY, 270);
});

test("coordenadas: current 300 target 700 visible 400 no scrollea", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 0, lastAutomaticScrollY: 300, currentScrollY: 300, viewportHeight: 600 },
    { targetLineIndex: 1, targetLineY: 700, timelineIndex: 1 },
  );

  assert.equal(decision.evaluation.targetVisibleY, 400);
  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "safe-zone");
});

test("coordenadas: current 300 target 900 visible 600 scrollea hacia adelante", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 0, lastAutomaticScrollY: 300, currentScrollY: 300, viewportHeight: 600 },
    { targetLineIndex: 1, targetLineY: 900, timelineIndex: 1 },
  );

  assert.equal(decision.evaluation.targetVisibleY, 600);
  assert.equal(decision.shouldScroll, true);
  assert.equal(decision.reason, "advanced");
  assert.equal(decision.targetY, 570);
});

test("candidate sin avance confirmado no scrollea", () => {
  const decision = decideAutoFollowScroll(baseState, {
    advanced: false,
    targetLineIndex: 5,
    targetLineY: 760,
    timelineIndex: 11,
  });

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "not-advanced");
});

test("confidence sin avance confirmado no scrollea", () => {
  const decision = decideAutoFollowScroll(baseState, {
    advanced: false,
    targetLineIndex: 6,
    targetLineY: 900,
    timelineIndex: 12,
  });

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "not-advanced");
});

test("layout incompleto no scrollea", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, layoutReady: false },
    { targetLineIndex: 8, targetLineY: 900, timelineIndex: 20 },
  );

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "layout-not-ready");
});

test("missing line measurement no scrollea", () => {
  const decision = decideAutoFollowScroll(baseState, {
    targetLineIndex: 8,
    targetLineY: null,
    timelineIndex: 20,
  });

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "missing-layout");
});

test("lineY no monotónico invalida layout y no scrollea", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, layoutValid: false },
    { targetLineIndex: 8, targetLineY: 900, timelineIndex: 20 },
  );

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "layout-invalid");
});

test("nunca salta visualmente mas que 45 por ciento del viewport", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 1, lastAutomaticScrollY: 300, currentScrollY: 300, viewportHeight: 600 },
    { targetLineIndex: 40, targetLineY: 3000, timelineIndex: 80 },
  );

  assert.equal(decision.shouldScroll, true);
  assert.equal(decision.targetY, 570);
});

test("target muy lejano hace scroll progresivo", () => {
  const first = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 1, lastAutomaticScrollY: 0, currentScrollY: 0, viewportHeight: 600 },
    { targetLineIndex: 40, targetLineY: 3000, timelineIndex: 80 },
  );
  assert.equal(first.shouldScroll, true);
  assert.equal(first.targetY, 270);

  const second = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 1, lastAutomaticScrollY: first.targetY, currentScrollY: first.targetY, viewportHeight: 600 },
    { targetLineIndex: 40, targetLineY: 3000, timelineIndex: 80 },
  );
  assert.equal(second.shouldScroll, true);
  assert.equal(second.targetY, 540);
});

test("canción corta no scrollea si la línea permanece visible", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 0, lastAutomaticScrollY: 0, currentScrollY: 0, viewportHeight: 800 },
    { targetLineIndex: 3, targetLineY: 420, timelineIndex: 5 },
  );

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "safe-zone");
});

test("canción larga scrollea progresivamente", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 0, lastAutomaticScrollY: 1200, currentScrollY: 1200, viewportHeight: 600 },
    { targetLineIndex: 80, targetLineY: 2600, timelineIndex: 120 },
  );

  assert.equal(decision.shouldScroll, true);
  assert.equal(decision.targetY, 1470);
});

test("muchas líneas de acordes juntas no fuerzan scroll si siguen visibles", () => {
  const decision = decideAutoFollowScroll(
    { ...baseState, lastScrolledLineIndex: 10, lastAutomaticScrollY: 500, currentScrollY: 500, viewportHeight: 600 },
    { targetLineIndex: 14, targetLineY: 850, timelineIndex: 30 },
  );

  assert.equal(decision.shouldScroll, false);
  assert.equal(decision.reason, "safe-zone");
});
