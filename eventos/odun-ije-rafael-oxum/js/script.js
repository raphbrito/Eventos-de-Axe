"use strict";

const config = {
    toast: { duration: 5000 }
};

const dom = {
    countdown: ["days", "hours", "minutes", "seconds"].reduce((items, id) => {
        items[id] = document.getElementById(id);
        return items;
    }, {}),
    event: {
        date: document.getElementById("eventDate"),
        time: document.getElementById("eventTime"),
        location: document.getElementById("eventLocation"),
        address: document.getElementById("eventAddress")
    },
    buttons: {
        rsvp: document.getElementById("btnRSVP"),
        googleMaps: document.getElementById("btnGoogleMaps"),
        waze: document.getElementById("btnWaze")
    },
    toast: {
        container: document.getElementById("toast"),
        title: document.getElementById("toastTitle"),
        message: document.getElementById("toastMessage"),
        close: document.getElementById("toastClose")
    }
};

const state = { countdownTimer: null, toastTimer: null };

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
    renderEvent();
    initializeCountdown();
    initializeButtons();
    document.getElementById("currentYear").textContent = new Date().getFullYear();
    dom.toast.close?.addEventListener("click", hideToast);
}

function eventDate() {
    return new Date(`${EVENTO.data}T${EVENTO.horario}:00`);
}

function formatAddress() {
    return [EVENTO.endereco, EVENTO.bairro, EVENTO.cidade, EVENTO.estado, EVENTO.cep]
        .filter(Boolean)
        .join(" - ");
}

function setText(id, value) {
    const element = document.getElementById(id);
    if (element && value) element.textContent = value;
}

function setImage(id, source, alt) {
    const image = document.getElementById(id);
    if (!image || !source) return;
    image.src = source;
    if (alt) image.alt = alt;
}

function renderEvent() {
    const date = eventDate();
    const visual = EVENTO.identidadeVisual ?? {};

    document.title = EVENTO.tituloEvento;
    document.querySelector('meta[name="description"]')?.setAttribute("content", EVENTO.descricao);
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", EVENTO.tituloEvento);
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", EVENTO.descricao);
    document.querySelector('meta[property="og:image"]')?.setAttribute("content", visual.imagemCompartilhamento || visual.convite || "");
    document.querySelector('link[rel="icon"]')?.setAttribute("href", visual.favicon || visual.brasaoAseTopazio || "");
    document.querySelector('link[rel="apple-touch-icon"]')?.setAttribute("href", visual.favicon || visual.brasaoAseTopazio || "");
    if (visual.fundo) {
        const fundoUrl = new URL(visual.fundo, window.location.href).href;
        document.documentElement.style.setProperty("--event-background", `url("${fundoUrl}")`);
    }

    setText("heroSubtitle", EVENTO.subtituloHero);
    setText("heroTitle", EVENTO.nomeEvento);
    setText("heroCelebrant", EVENTO.celebrante);
    setText("heroMessage", EVENTO.mensagemHero);
    setText("rsvpMessage", EVENTO.rsvp?.descricao);
    setText("directionsDescription", EVENTO.localizacao?.descricao);
    setText("directionsMessage", EVENTO.localizacao?.mensagem);
    dom.event.date.textContent = date.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
    dom.event.time.textContent = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    dom.event.location.textContent = EVENTO.local;
    dom.event.address.textContent = formatAddress();

    setImage("heroLogo", visual.logo, `Logo do ${EVENTO.nomeEvento}`);
    setImage("dashboardLogo", visual.brasaoAseTopazio, "Dashboard");
    setImage("aseEsmeraldaLogo", visual.brasaoAseEsmeralda);
    setImage("aseTopazioLogo", visual.brasaoAseTopazio);
}

function initializeCountdown() {
    updateCountdown();
    state.countdownTimer = window.setInterval(updateCountdown, 1000);
}

function updateCountdown() {
    const totalSeconds = Math.max(0, Math.floor((eventDate() - new Date()) / 1000));
    const time = {
        days: Math.floor(totalSeconds / 86400),
        hours: Math.floor((totalSeconds % 86400) / 3600),
        minutes: Math.floor((totalSeconds % 3600) / 60),
        seconds: totalSeconds % 60
    };
    dom.countdown.days.textContent = time.days;
    dom.countdown.hours.textContent = String(time.hours).padStart(2, "0");
    dom.countdown.minutes.textContent = String(time.minutes).padStart(2, "0");
    dom.countdown.seconds.textContent = String(time.seconds).padStart(2, "0");
    if (totalSeconds === 0) window.clearInterval(state.countdownTimer);
}

function initializeButtons() {
    dom.buttons.rsvp?.addEventListener("click", () => openLink(EVENTO.rsvp?.link, "Formulário indisponível", "O formulário de confirmação ainda não foi disponibilizado."));
    dom.buttons.googleMaps?.addEventListener("click", () => openLink(EVENTO.localizacao?.googleMaps, "Localização indisponível", "O link do Google Maps ainda não foi configurado."));
    dom.buttons.waze?.addEventListener("click", () => openLink(EVENTO.localizacao?.waze, "Localização indisponível", "O link do Waze ainda não foi configurado."));
}

function openLink(url, title, message) {
    if (!url) return showToast(title, message, "warning");
    window.open(url, "_blank", "noopener,noreferrer");
}

function showToast(title, message, type = "success") {
    if (!dom.toast.container) return;
    window.clearTimeout(state.toastTimer);
    dom.toast.container.classList.remove("toast-success", "toast-warning", "toast-error");
    dom.toast.container.classList.add(`toast-${type}`, "is-visible");
    dom.toast.title.textContent = title;
    dom.toast.message.textContent = message;
    state.toastTimer = window.setTimeout(hideToast, config.toast.duration);
}

function hideToast() {
    window.clearTimeout(state.toastTimer);
    dom.toast.container?.classList.remove("is-visible");
}
