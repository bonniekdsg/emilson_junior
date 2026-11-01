import assert from "node:assert/strict";
import { test } from "node:test";

import { caretAfterDigits, formatPhone, isValidPhone, phoneDigits, toPayload, validateLead } from "../lib/lead.js";

test("phoneDigits limpa pontuação, zero de operadora e DDI", () => {
  assert.equal(phoneDigits("(68) 99999-1234"), "68999991234");
  assert.equal(phoneDigits("+55 68 99999-1234"), "68999991234");
  assert.equal(phoneDigits("0 68 99999-1234"), "68999991234");
  assert.equal(phoneDigits(""), "");
  assert.equal(phoneDigits(undefined), "");
});

test("phoneDigits preserva o DDD 55 quando não há DDI", () => {
  assert.equal(phoneDigits("55 99999-1234"), "55999991234");
});

test("formatPhone mascara progressivamente enquanto digita", () => {
  const typed = "68999991234";
  const steps = [...typed].map((_, i) => formatPhone(typed.slice(0, i + 1)));
  assert.deepEqual(steps, [
    "(6",
    "(68",
    "(68) 9",
    "(68) 99",
    "(68) 999",
    "(68) 9999",
    "(68) 9999-9",
    "(68) 9999-91",
    "(68) 9999-912",
    "(68) 9999-9123",
    "(68) 99999-1234",
  ]);
});

test("formatPhone formata fixo e trunca excesso", () => {
  assert.equal(formatPhone("6833334444"), "(68) 3333-4444");
  assert.equal(formatPhone("689999912345678"), "(68) 99999-1234");
});

test("caretAfterDigits posiciona depois do n-ésimo dígito", () => {
  assert.equal(caretAfterDigits("(68) 9999-9", 0), 1);
  assert.equal(caretAfterDigits("(68) 9999-9", 2), 3);
  assert.equal(caretAfterDigits("(68) 9999-9", 3), 6);
  assert.equal(caretAfterDigits("(68) 9999-9", 7), 11);
  assert.equal(caretAfterDigits("(68) 9999-9", 99), 11);
});

test("isValidPhone aceita celular e fixo, recusa o resto", () => {
  assert.ok(isValidPhone("68999991234"));
  assert.ok(isValidPhone("6833334444"));
  assert.ok(!isValidPhone("68899991234"), "celular sem o 9");
  assert.ok(!isValidPhone("6893334444"), "fixo começando com 9");
  assert.ok(!isValidPhone("08999991234"), "DDD com zero");
  assert.ok(!isValidPhone("60999991234".slice(0, 9)), "curto demais");
});

test("validateLead exige nome e WhatsApp, nessa ordem", () => {
  assert.deepEqual(Object.keys(validateLead({})), ["nome", "whatsapp"]);
  assert.deepEqual(validateLead({ nome: "Ana", whatsapp: "(68) 99999-1234" }), {});
  assert.match(validateLead({ nome: " ", whatsapp: "" }).whatsapp, /Informe/);
  assert.match(validateLead({ nome: "Ana", whatsapp: "(68) 8999" }).whatsapp, /Confira/);
});

test("toPayload normaliza os campos", () => {
  const now = new Date("2026-11-01T12:00:00Z");
  const payload = toPayload(
    {
      nome: "  Maria   da  Silva ",
      whatsapp: "(68) 99999-1234",
      bairro: " Centro ",
      assunto: "Saúde",
      mensagem: "  Mais médicos no posto. ",
      novidades: true,
    },
    now,
  );
  assert.deepEqual(payload, {
    nome: "Maria da Silva",
    whatsapp: "+5568999991234",
    bairro: "Centro",
    assunto: "Saúde",
    mensagem: "Mais médicos no posto.",
    novidades: true,
    origem: "site",
    enviadoEm: "2026-11-01T12:00:00.000Z",
  });
});
