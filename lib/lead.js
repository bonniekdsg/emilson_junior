// Regras do formulário de contato: máscara e validação do WhatsApp e montagem
// do payload. Sem DOM, para rodar igual no navegador e no `node --test`.

const NATIONAL_DIGITS = 11; // DDD + 9 dígitos do celular

/**
 * Dígitos nacionais (DDD + número) a partir do que a pessoa digitou ou colou.
 * Tolera "+55", zero de operadora à esquerda e qualquer pontuação.
 */
export function phoneDigits(value) {
  let d = String(value ?? "").replace(/\D/g, "").replace(/^0+/, "");
  // Só tira o DDI quando sobra número demais: "55" também é DDD válido (RS).
  if (d.length > NATIONAL_DIGITS && d.startsWith("55")) d = d.slice(2);
  return d.slice(0, NATIONAL_DIGITS);
}

/** "(68) 99999-9999" para celular, "(68) 3333-4444" para fixo; parcial enquanto digita. */
export function formatPhone(value) {
  const d = phoneDigits(value);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;

  const ddd = d.slice(0, 2);
  const rest = d.slice(2);
  if (rest.length <= 4) return `(${ddd}) ${rest}`;

  const split = rest.length === 9 ? 5 : 4;
  return `(${ddd}) ${rest.slice(0, split)}-${rest.slice(split)}`;
}

/** Posição do cursor logo depois do n-ésimo dígito de um valor formatado. */
export function caretAfterDigits(formatted, n) {
  if (n <= 0) return formatted.startsWith("(") ? 1 : 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/\d/.test(formatted[i]) && ++seen === n) return i + 1;
  }
  return formatted.length;
}

/**
 * Celular (11 dígitos, começa com 9 depois do DDD) ou fixo (10 dígitos,
 * começa com 2–5). WhatsApp Business também roda em fixo.
 */
export function isValidPhone(digits) {
  if (!/^[1-9][1-9]\d{8,9}$/.test(digits)) return false;
  return digits.length === NATIONAL_DIGITS ? digits[2] === "9" : /[2-5]/.test(digits[2]);
}

/** Erros por campo, na ordem do formulário. Objeto vazio = válido. */
export function validateLead({ nome = "", whatsapp = "" }) {
  const errors = {};

  if (nome.trim().length < 2) errors.nome = "Informe seu nome.";

  const digits = phoneDigits(whatsapp);
  if (digits.length === 0) {
    errors.whatsapp = "Informe seu WhatsApp com DDD.";
  } else if (!isValidPhone(digits)) {
    errors.whatsapp = "Confira o número. Ex.: (68) 99999-9999";
  }

  return errors;
}

/** Corpo do POST. Só chame com dados já validados. */
export function toPayload(data, now = new Date()) {
  return {
    nome: data.nome.trim().replace(/\s+/g, " "),
    whatsapp: `+55${phoneDigits(data.whatsapp)}`,
    bairro: (data.bairro ?? "").trim(),
    assunto: data.assunto ?? "",
    mensagem: (data.mensagem ?? "").trim(),
    novidades: data.novidades === true,
    origem: "site",
    enviadoEm: now.toISOString(),
  };
}
