import assert from "node:assert/strict";
import test from "node:test";
import { ChordAdvanceMachine } from "../mobile/src/music/chordAdvance.ts";

const config = { minConfidence: 0.6, stableFrames: 3, cooldownMs: 800 };

test("confirma el acorde actual sin avanzar", () => {
  const machine = new ChordAdvanceMachine(["G", "D", "Em", "C"], config);

  machine.process({ candidate: "G", confidence: 0.8, nowMs: 0 });
  machine.process({ candidate: "G", confidence: 0.8, nowMs: 100 });
  const output = machine.process({ candidate: "G", confidence: 0.8, nowMs: 200 });

  assert.equal(output.status, "confirmed");
  assert.equal(output.index, 0);
  assert.equal(output.advanced, false);
});

test("avanza solo al siguiente acorde esperado luego de varias ventanas estables", () => {
  const machine = new ChordAdvanceMachine(["G", "D", "Em", "C"], config);

  machine.process({ candidate: "G", confidence: 0.8, nowMs: 0 });
  machine.process({ candidate: "G", confidence: 0.8, nowMs: 100 });
  machine.process({ candidate: "G", confidence: 0.8, nowMs: 200 });
  machine.process({ candidate: "D", confidence: 0.8, nowMs: 1200 });
  machine.process({ candidate: "D", confidence: 0.8, nowMs: 1300 });
  const output = machine.process({ candidate: "D", confidence: 0.8, nowMs: 1400 });

  assert.equal(output.status, "advanced");
  assert.equal(output.index, 1);
  assert.equal(output.advanced, true);
});

test("no avanza por ruido o baja confianza", () => {
  const machine = new ChordAdvanceMachine(["G", "D"], config);

  machine.process({ candidate: "G", confidence: 0.8, nowMs: 0 });
  machine.process({ candidate: "G", confidence: 0.8, nowMs: 100 });
  machine.process({ candidate: "G", confidence: 0.8, nowMs: 200 });
  machine.process({ candidate: "D", confidence: 0.4, nowMs: 1200 });
  machine.process({ candidate: "D", confidence: 0.4, nowMs: 1300 });
  const output = machine.process({ candidate: "D", confidence: 0.4, nowMs: 1400 });

  assert.equal(output.index, 0);
  assert.equal(output.status, "unknown");
});

test("cooldown evita doble avance inmediato", () => {
  const machine = new ChordAdvanceMachine(["G", "D", "Em"], config);

  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "G", confidence: 0.8, nowMs: i * 100 });
  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "D", confidence: 0.8, nowMs: 1200 + i * 100 });
  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "Em", confidence: 0.8, nowMs: 1500 + i * 100 });

  assert.equal(machine.currentIndex, 1);
});

test("no avanza acordes repetidos sin una caida intermedia a unknown", () => {
  const machine = new ChordAdvanceMachine(["G", "G", "D"], config);

  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "G", confidence: 0.8, nowMs: i * 100 });
  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "G", confidence: 0.8, nowMs: 1200 + i * 100 });

  assert.equal(machine.currentIndex, 0);
});

test("soporta acordes repetidos con caida a unknown y nuevo acorde estable", () => {
  const machine = new ChordAdvanceMachine(["G", "G", "D"], config);

  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "G", confidence: 0.8, nowMs: i * 100 });
  machine.process({ candidate: "unknown", confidence: 0, nowMs: 700 });
  machine.process({ candidate: "unknown", confidence: 0, nowMs: 800 });
  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "G", confidence: 0.8, nowMs: 1200 + i * 100 });

  assert.equal(machine.currentIndex, 1);
});

test("state machine avanza usando una secuencia derivada", () => {
  const derivedSequence = ["G", "D", "Em", "C"] as const;
  const machine = new ChordAdvanceMachine(derivedSequence, config);

  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "G", confidence: 0.8, nowMs: i * 100 });
  for (let i = 0; i < 3; i += 1) machine.process({ candidate: "D", confidence: 0.8, nowMs: 1200 + i * 100 });

  assert.equal(machine.currentIndex, 1);
});
