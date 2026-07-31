/* ================================================== */
/* ELEMENTOS */
/* ================================================== */

const elements = {

    /* Login */
    login: document.getElementById("login"),
    loginForm: document.getElementById("loginForm"),
    username: document.getElementById("username"),
    password: document.getElementById("password"),

    /* Dashboard */
    dashboard: document.getElementById("dashboard"),
    logoutButton: document.getElementById("logoutButton"),

    /* Estatísticas */
    totalRsvp: document.getElementById("totalRsvp"),
    totalConfirmed: document.getElementById("totalConfirmed"),
    totalCompanions: document.getElementById("totalCompanions"),
    totalPeople: document.getElementById("totalPeople"),
    confirmationRate: document.getElementById("confirmationRate"),
    averageCompanions: document.getElementById("averageCompanions"),
    lastResponse: document.getElementById("lastResponse"),
    lastUpdate: document.getElementById("statsLastUpdate"),

    /* Lista de convidados */
    guestTableHeader: document.getElementById("guestTableHeader"),
    guestTableBody: document.getElementById("guestTableBody"),
    exportPdf: document.getElementById("exportPdf"),
    exportReceptionPdf: document.getElementById("exportReceptionPdf"),
    exportExcel: document.getElementById("exportExcel"),

    /* Toast */
    toast: document.getElementById("toast"),
    toastMessage: document.getElementById("toastMessage"),

    /* Utilidades */
    currentYear: document.getElementById("currentYear")

};

/* ================================================== */
/* CONFIGURAÇÃO */
/* ================================================== */

const CONFIG = {
    API_URL: window.EVENTOS_DE_AXE_API_URL,
    MOBILE_BREAKPOINT: 768,
    TOAST_DURATION: 3000,
    RESIZE_DEBOUNCE: 150
};

/* ================================================== */
/* ESTADO DA APLICAÇÃO */
/* ================================================== */

const state = {
    authenticated: false,
    dashboard: null
};

/* ================================================== */
/* API */
/* ================================================== */

async function request(params = {}) {
    const url = new URL(CONFIG.API_URL);
    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
            url.searchParams.append(
                key,
                value
            );
        }
    });
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(
            "Não foi possível conectar ao servidor."
        );
    }
    return await response.json();
}
async function fetchDashboardData(username, password) {
    const call = async (route, payload) => {
        const response = await fetch(CONFIG.API_URL + "?route=" + encodeURIComponent(route), {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            body: JSON.stringify({ ...payload, route })
        });
        return await response.json();
    };
    const login = await call("login", { email: username, senha: password });
    if (!login.success) return { status: "erro", mensagem: login.message };
    localStorage.setItem("gatekeeper.session-token", login.data.token);
    const dashboard = await call("event-dashboard", { _method: "GET", token: login.data.token, slug: EVENTO.slug });
    if (!dashboard.success) return { status: "erro", mensagem: dashboard.message };
    return { status: "ok", ...dashboard.data };
}
async function fetchDashboardFromSession(token) {
    const response = await fetch(CONFIG.API_URL + "?route=event-dashboard", {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ route: "event-dashboard", _method: "GET", token: token, slug: EVENTO.slug })
    });
    const dashboard = await response.json();
    if (!dashboard.success) return { status: "erro", mensagem: dashboard.message };
    return { status: "ok", ...dashboard.data };
}

/* ================================================== */
/* INICIALIZAÇÃO */
/* ================================================== */

async function initialize() {
    Exports.init();
    registerEvents();
    const token = localStorage.getItem("gatekeeper.session-token");
    if (!token) return showLogin();
    try {
        const data = await fetchDashboardFromSession(token);
        if (data.status !== "ok") throw new Error(data.mensagem);
        state.authenticated = true;
        state.dashboard = data;
        showDashboard();
    } catch (_) {
        localStorage.removeItem("gatekeeper.session-token");
        showLogin();
    }
}
document.addEventListener(
    "DOMContentLoaded",
    initialize
);

/* ================================================== */
/* LOGIN */
/* ================================================== */

async function login() {
    const username =
        elements.username.value.trim();
    const password =
        elements.password.value.trim();
    if (!username || !password) {
        showToast(
            "Informe o usuário e a senha.",
            "error"
        );
        if (!username) {
            elements.username.focus();
        } else {
            elements.password.focus();
        }
        return;
    }
    try {
        const data = await fetchDashboardData(
            username,
            password
        );
        if (data.status !== "ok") {
            showToast(
                data.mensagem || "Usuário ou senha inválidos.",
                "error"
            );
            elements.password.focus();
            elements.password.select();
            return;
        }
        state.authenticated = true;
        state.dashboard = data;
        elements.loginForm.reset();
        showDashboard();
        showToast(
            "Login realizado com sucesso."
        );
    } catch (error) {
        showToast(
            error.message || "Erro ao conectar ao servidor.",
            "error"
        );
    }
}

/* ================================================== */
/* DASHBOARD */
/* ================================================== */

function showDashboard() {
    elements.login.hidden = true;
    elements.dashboard.hidden = false;
    updateStatistics();
    updateGuestsTable();
    updateLastUpdate();
}
function showLogin() {
    elements.dashboard.hidden = true;
    elements.login.hidden = false;
    elements.username.focus();
}
function logout() {
    localStorage.removeItem("gatekeeper.session-token");
    state.authenticated = false;
    state.dashboard = null;
    elements.loginForm.reset();
    showLogin();
    showToast(
        "Sessão encerrada."
    );
}
function updateStatistics() {
    const stats = state.dashboard?.estatisticas;
    if (!stats) {
        return;
    }
    elements.totalRsvp.textContent =
        stats.respostas;
    elements.totalConfirmed.textContent =
        stats.confirmados;
    elements.totalCompanions.textContent =
        stats.acompanhantes;
    elements.totalPeople.textContent =
        stats.pessoas;
    elements.confirmationRate.textContent =
        `${stats.taxaConfirmacao.toFixed(2)}%`;
    elements.averageCompanions.textContent =
        stats.mediaAcompanhantes.toFixed(2);
    elements.lastResponse.textContent =
        stats.ultimaResposta || "--";
}
function updateLastUpdate() {
    const atualizadoEm =
        state.dashboard?.atualizadoEm;
    if (!atualizadoEm) {
        return;
    }
    elements.lastUpdate.textContent =
        atualizadoEm;
}

/* ================================================== */
/* TABELA */
/* ================================================== */

function updateGuestsTable() {
    const convidados =
        state.dashboard?.convidados ?? [];
    const mobile =
        isMobileLayout();
    const config =
        getGuestsTableConfig(mobile);
    elements.guestTableHeader.innerHTML =
        renderGuestsTableHeader(config);
    elements.guestTableBody.innerHTML =
        renderGuestsTableBody(
            convidados,
            config
        );
}
function getGuestsTableConfig(isMobile) {
    if (isMobile) {
        return {
            columns: 2,
            confirmedOnly: true,
            headers: [
                "Convidado",
                "Acompanhantes"
            ]
        };
    }
    return {
        columns: 4,
        confirmedOnly: false,
        headers: [
            "Convidado",
            "Confirmação",
            "Acompanhantes",
            "Data da Resposta"
        ]
    };
}
function renderGuestsTableHeader(config) {
    return config.headers
        .map(
            title => `<th>${title}</th>`
        )
        .join("");
}
function renderGuestsTableBody(
    convidados,
    config
) {
    let lista = [...convidados];
    if (config.confirmedOnly) {
        lista = lista.filter(
            convidado => convidado.confirmado === true
        );
    }
    if (lista.length === 0) {
        return createEmptyRow(
            config.columns
        );
    }
    if (config.confirmedOnly) {
        return createMobileGuestRows(
            lista
        );
    }
    return createDesktopGuestRows(
        lista
    );
}
function createDesktopGuestRows(convidados) {
    return convidados
        .map(createDesktopGuestRow)
        .join("");
}
function createMobileGuestRows(convidados) {
    return convidados
        .map(createMobileGuestRow)
        .join("");
}
function createDesktopGuestRow(convidado) {
    const nome =
        convidado.nome ?? "-";
    const confirmou =
        formatConfirmation(
            convidado.confirmado
        );
    const acompanhantes =
        formatCompanions(
            convidado.acompanhantes
        );
    const dataResposta =
        formatResponseDate(
            convidado.dataResposta
        );
    return `
        <tr>
            <td>${nome}</td>
            <td>${confirmou}</td>
            <td>${acompanhantes}</td>
            <td>${dataResposta}</td>
        </tr>
    `;
}
function createMobileGuestRow(convidado) {
    const nome =
        convidado.nome ?? "-";
    const acompanhantes =
        formatCompanions(
            convidado.acompanhantes
        );
    return `
        <tr>
            <td>${nome}</td>
            <td>${acompanhantes}</td>
        </tr>
    `;
}
function createEmptyRow(columns) {
    return `
        <tr class="empty-state">
            <td colspan="${columns}">
                Nenhuma confirmação encontrada.
            </td>
        </tr>
    `;
}
function formatConfirmation(confirmado) {
    if (confirmado === true) {
        return "Confirmado";
    }
    if (confirmado === false) {
        return "Recusou";
    }
    return "-";
}
function formatCompanions(acompanhantes) {
    const total =
        Number(acompanhantes ?? 0);
    if (total === 0) {
        return "0";
    }
    if (total === 1) {
        return "1";
    }
    return `${total}`;
}
function formatResponseDate(dataResposta) {
    if (!dataResposta) {
        return "-";
    }
    return dataResposta;
}

/* ================================================== */
/* TOAST */
/* ================================================== */

let toastTimeout = null;
function showToast(
    message,
    type = "success"
) {
    clearTimeout(toastTimeout);
    elements.toastMessage.textContent =
        message;
    elements.toast.className =
        `toast toast-${type}`;
    elements.toast.classList.add(
        "is-visible"
    );
    toastTimeout = setTimeout(
        hideToast,
        CONFIG.TOAST_DURATION
    );
}
function hideToast() {
    clearTimeout(toastTimeout);
    elements.toast.classList.remove(
        "is-visible"
    );
    toastTimeout = null;
}

/* ================================================== */
/* UTILITÁRIOS */
/* ================================================== */

function isMobileLayout() {
    return (
        window.innerWidth <=
        CONFIG.MOBILE_BREAKPOINT
    );
}
function debounce(
    callback,
    delay = CONFIG.RESIZE_DEBOUNCE
) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(
            () => callback(...args),
            delay
        );
    };
}

/* ================================================== */
/* EVENTOS */
/* ================================================== */

function registerEvents() {
    elements.loginForm.addEventListener(
        "submit",
        handleLogin
    );
    elements.logoutButton.addEventListener(
        "click",
        handleLogout
    );
    elements.exportPdf.addEventListener(
        "click",
        handleExportPdf
    );
    elements.exportReceptionPdf.addEventListener(
        "click",
        handleExportReceptionPdf
    );
    elements.exportExcel.addEventListener(
        "click",
        handleExportExcel
    );
    window.addEventListener(
        "resize",
        debounce(handleResize)
    );
}

/* ================================================== */
/* CONTEXTO DE EXPORTAÇÃO */
/* ================================================== */

function createExportContext() {
    return {
        event: EVENTO,
        guests: state.dashboard?.convidados ?? [],
        generatedAt: new Date()
    };
}

/* ================================================== */
/* HANDLERS */
/* ================================================== */

async function handleLogin(event) {
    event.preventDefault();
    await login();
}
function handleLogout() {
    logout();
}
function handleResize() {
    if (
        !state.authenticated ||
        !state.dashboard
    ) {
        return;
    }
    updateGuestsTable();
}
function handleExportPdf() {
    if (!state.dashboard) {
        showToast(
            "Nenhum dado disponível para exportação.",
            "error"
        );
        return;
    }
    try {
        const context = createExportContext();
        Exports.exportOfficialPdf(context);
        showToast(
            "PDF gerado com sucesso."
        );
    } catch (error) {
        console.error("Falha ao gerar o PDF oficial:", error);
        showToast(
            "Não foi possível gerar o PDF oficial.",
            "error"
        );
    }
}
function handleExportReceptionPdf() {
    if (!state.dashboard) {
        showToast(
            "Nenhum dado disponível para exportação.",
            "error"
        );
        return;
    }
    const context = createExportContext();
    Exports.exportReceptionPdf(context);
    showToast(
        "Lista de recepção gerada com sucesso."
    );
}
function handleExportExcel() {
    if (!state.dashboard) {
        showToast(
            "Nenhum dado disponível para exportação.",
            "error"
        );
        return;
    }
    const context = createExportContext();
    Exports.exportExcel(context);
    showToast(
        "Planilha gerada com sucesso."
    );
}
