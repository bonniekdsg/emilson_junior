// Emilson Júnior — comportamento da landing.
// O CSS define a coreografia; este módulo prepara o DOM e liga os gatilhos
// (.is-loaded na abertura, .is-in ao rolar), a navegação e o formulário.

import { caretAfterDigits, formatPhone, phoneDigits, toPayload, validateLead } from "./lib/lead.js";

const CONFIG = {
  // Endpoint que recebe o formulário (POST JSON). Vazio = envio desligado.
  // Ao configurar, libere a origem dele em connect-src na CSP do index.html.
  formEndpoint: "",
  // WhatsApp com DDI e DDD, só dígitos (ex.: "5568999999999"). Vazio = os
  // botões "Vamos conversar" continuam levando ao formulário.
  whatsapp: "",
  whatsappMessage: "Olá, Emilson! Vim pelo site e quero conversar.",
  // Perfil do Instagram, só o usuário (sem @). Vazio = ícone sem link.
  instagram: "",
};

// Teto de espera pela fonte e pela foto do hero antes de abrir a cena: nunca
// segurar a página em rede lenta.
const INTRO_WAIT_MS = 900;
// Teto de espera pelas imagens de um bloco antes de revelá-lo.
const DECODE_TIMEOUT_MS = 700;
// Um bloco entra quando o topo dele passa de 82% da altura da tela: cedo o
// bastante para a animação acontecer à vista, tarde o bastante para não
// terminar abaixo da dobra.
const REVEAL_ROOT_MARGIN = "0px 0px -18% 0px";
// Abertura: o que já está visível abaixo do hero entra depois dele.
const FOLD_STAGGER_MS = 900;
const SUBMIT_TIMEOUT_MS = 12000;

// Sinaliza ao failsafe do <head> que o módulo carregou.
window.__ejReady = true;

const motionOK = matchMedia("(prefers-reduced-motion: no-preference)").matches;

// Atrasos de stagger vêm de data-delay (ms). Passam por CSSOM porque a CSP
// bloqueia atributos style inline.
for (const el of document.querySelectorAll("[data-delay]")) {
  el.style.setProperty("--d", `${Number(el.dataset.delay) || 0}ms`);
}

initWhatsApp();
initInstagram();
initNav();
initForm();

if (motionOK) {
  document.querySelectorAll("[data-split]").forEach(splitWords);
  playIntro().then(() => setTimeout(observeReveals, FOLD_STAGGER_MS));
}

/* ---------- Movimento ---------- */

/**
 * Quebra o texto em palavras, cada uma dentro de uma máscara, preservando
 * elementos internos (ex.: <em>Feijó</em> em amarelo). Leitores de tela leem
 * a frase original, guardada num span oculto; as palavras ficam aria-hidden.
 */
function splitWords(el) {
  const label = el.textContent.replace(/\s+/g, " ").trim();
  let index = 0;

  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        walk(child);
        continue;
      }
      if (child.nodeType !== Node.TEXT_NODE) continue;

      const frag = document.createDocumentFragment();
      for (const part of child.textContent.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) {
          frag.append(" ");
          continue;
        }
        const mask = document.createElement("span");
        mask.className = "w";
        const inner = document.createElement("span");
        inner.className = "w-i";
        inner.style.setProperty("--i", index++);
        inner.textContent = part;
        mask.append(inner);
        frag.append(mask);
      }
      child.replaceWith(frag);
    }
  };
  walk(el);

  const visual = document.createElement("span");
  visual.setAttribute("aria-hidden", "true");
  visual.append(...el.childNodes);
  const spoken = document.createElement("span");
  spoken.className = "visually-hidden";
  spoken.textContent = label;
  el.append(spoken, visual);
}

/** Espera fonte e foto do hero (com teto) e abre a cena: menu e hero. */
async function playIntro() {
  const person = document.querySelector(".hero__person img");
  const ready = Promise.all([document.fonts?.ready, person?.decode().catch(() => {})]);
  await Promise.race([ready, wait(INTRO_WAIT_MS)]);
  await nextFrame();
  document.querySelectorAll('[data-reveal="intro"]').forEach((el) => el.classList.add("is-in"));
}

function observeReveals() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        // Acima da tela (chegou por âncora, ex.: #contato): mostra sem
        // esperar, para não haver buraco ao rolar de volta.
        const passed = !entry.isIntersecting && entry.boundingClientRect.bottom < 0;
        if (!entry.isIntersecting && !passed) continue;
        io.unobserve(entry.target);
        reveal(entry.target);
      }
    },
    { rootMargin: REVEAL_ROOT_MARGIN },
  );
  document.querySelectorAll('[data-reveal]:not([data-reveal="intro"])').forEach((el) => io.observe(el));
}

// Espera as imagens do bloco (lazy) para a foto não surgir depois da animação.
async function reveal(el) {
  const decodes = [...el.querySelectorAll("img")].map((img) => img.decode().catch(() => {}));
  await Promise.race([Promise.all(decodes), wait(DECODE_TIMEOUT_MS)]);
  el.classList.add("is-in");
}

/* ---------- Navegação ---------- */

function initNav() {
  const nav = document.querySelector("[data-nav]");
  const toggle = nav.querySelector("[data-nav-toggle]");
  const toggleLabel = toggle.querySelector(".visually-hidden");
  const menu = nav.querySelector("[data-nav-menu]");

  const isOpen = () => toggle.getAttribute("aria-expanded") === "true";
  const setOpen = (open) => {
    nav.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggleLabel.textContent = open ? "Fechar menu" : "Abrir menu";
  };

  toggle.addEventListener("click", () => setOpen(!isOpen()));
  menu.addEventListener("click", (e) => {
    if (e.target.closest("a")) setOpen(false);
  });
  document.addEventListener("click", (e) => {
    if (isOpen() && !nav.contains(e.target)) setOpen(false);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      setOpen(false);
      toggle.focus();
    }
  });

  // Sombra quando a barra descola do topo.
  const sentinel = document.querySelector("[data-nav-sentinel]");
  new IntersectionObserver(([entry]) => {
    nav.classList.toggle("is-stuck", !entry.isIntersecting);
  }).observe(sentinel);

  // Marca no menu a seção que está no meio da tela.
  const links = new Map([...nav.querySelectorAll(".nav__links a")].map((a) => [a.hash.slice(1), a]));
  const spy = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        for (const [id, a] of links) {
          if (id === entry.target.id) a.setAttribute("aria-current", "location");
          else a.removeAttribute("aria-current");
        }
      }
    },
    { rootMargin: "-45% 0px -50% 0px" },
  );
  for (const id of links.keys()) {
    const section = document.getElementById(id);
    if (section) spy.observe(section);
  }
}

function initWhatsApp() {
  if (!/^\d{12,13}$/.test(CONFIG.whatsapp)) return;
  const href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(CONFIG.whatsappMessage)}`;
  for (const a of document.querySelectorAll("[data-whatsapp]")) {
    a.href = href;
    a.target = "_blank";
    a.rel = "noopener";
  }
}

function initInstagram() {
  if (!/^[A-Za-z0-9._]{1,30}$/.test(CONFIG.instagram)) return;
  for (const a of document.querySelectorAll("[data-instagram]")) {
    a.href = `https://www.instagram.com/${CONFIG.instagram}/`;
    a.target = "_blank";
    a.rel = "noopener";
  }
}

/* ---------- Formulário ---------- */

function initForm() {
  const form = document.querySelector("[data-form]");
  if (!form) return;

  const fields = form.elements;
  const submit = form.querySelector("[data-form-submit]");
  const submitLabel = form.querySelector("[data-form-label]");
  const status = form.querySelector("[data-form-status]");
  let attempted = false;
  let sending = false;

  const read = () => ({
    nome: fields.nome.value,
    whatsapp: fields.whatsapp.value,
    bairro: fields.bairro.value,
    assunto: fields.assunto.value,
    mensagem: fields.mensagem.value,
    novidades: fields.novidades.checked,
    site: fields.site.value,
  });

  maskPhone(fields.whatsapp);

  // Depois da primeira tentativa, os erros acompanham a digitação.
  form.addEventListener("input", () => {
    if (attempted) showErrors(form, validateLead(read()));
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    attempted = true;

    const data = read();
    const errors = validateLead(data);
    showErrors(form, errors);
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid) {
      fields[firstInvalid].focus();
      return;
    }

    // Robô preencheu a isca: responde como sucesso e não envia nada.
    if (data.site) {
      showDone(form, data.nome);
      return;
    }

    sending = true;
    submit.setAttribute("aria-busy", "true");
    submitLabel.textContent = "Enviando…";
    status.hidden = true;

    try {
      await send(toPayload(data));
      showDone(form, data.nome);
    } catch (err) {
      console.error("[contato] envio falhou:", err);
      status.textContent = "Não foi possível enviar agora. Tente de novo em instantes.";
      status.hidden = false;
    } finally {
      sending = false;
      submit.removeAttribute("aria-busy");
      submitLabel.textContent = "Enviar minha opinião";
    }
  });
}

function maskPhone(input) {
  let previous = input.value;

  input.addEventListener("input", (e) => {
    let value = input.value;
    let digitsBefore = value.slice(0, input.selectionStart).replace(/\D/g, "").length;

    // Backspace em cima de um separador não mudaria nada (a máscara o
    // recolocaria). Apaga o dígito anterior junto, como a pessoa espera.
    if (e.inputType === "deleteContentBackward" && phoneDigits(value) === phoneDigits(previous) && digitsBefore > 0) {
      const digits = phoneDigits(value);
      value = digits.slice(0, digitsBefore - 1) + digits.slice(digitsBefore);
      digitsBefore -= 1;
    }

    const formatted = formatPhone(value);
    input.value = formatted;
    const caret = caretAfterDigits(formatted, digitsBefore);
    input.setSelectionRange(caret, caret);
    previous = formatted;
  });
}

function showErrors(form, errors) {
  for (const name of ["nome", "whatsapp"]) {
    const input = form.elements[name];
    const slot = form.querySelector(`#${input.getAttribute("aria-describedby")}`);
    const message = errors[name];
    if (message) input.setAttribute("aria-invalid", "true");
    else input.removeAttribute("aria-invalid");
    slot.textContent = message ?? "";
    slot.hidden = !message;
  }
}

function showDone(form, nome) {
  const firstName = nome.trim().split(/\s+/)[0];
  form.querySelector("[data-form-fields]").hidden = true;
  form.querySelector("[data-form-done]").hidden = false;
  const title = form.querySelector("[data-form-done-title]");
  title.textContent = firstName ? `Obrigado, ${firstName}!` : "Obrigado!";
  title.focus();
}

async function send(payload) {
  if (!CONFIG.formEndpoint) throw new Error("CONFIG.formEndpoint não configurado");
  const res = await fetch(CONFIG.formEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    credentials: "omit",
    signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

/* ---------- Utilitários ---------- */

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Dois quadros garantem que o estado inicial foi pintado antes da transição.
// Com teto: sem quadros (aba em segundo plano), não segura a página.
function nextFrame() {
  const frames = new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return Promise.race([frames, wait(100)]);
}
