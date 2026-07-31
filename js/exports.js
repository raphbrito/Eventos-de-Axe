/**
 * Geração de listas do painel administrativo.
 * O módulo recebe os dados do evento e dos convidados pelo contexto,
 * sem depender do estado do dashboard.
 */
const Exports = (() => {
    "use strict";

    const CONFIG = {
        margin: 15,
        colors: {
            text: [40, 40, 40],
            muted: [110, 110, 110],
            line: [180, 180, 180],
            header: [40, 40, 40]
        }
    };

    function init() {
        if (!window.jspdf || !window.XLSX) {
            console.error("As bibliotecas de exportação não foram carregadas.");
        }
    }

    function exportOfficialPdf(context) {
        const doc = createPdf();
        const summary = getSummary(context);
        const tableStart = buildHeader(doc, context, "Lista Oficial de Convidados");
        buildOfficialSummary(doc, summary, tableStart);
        buildOfficialTable(doc, getConfirmedGuests(context), tableStart + 45);
        savePdf(doc, context.event, "Lista-Convidados");
    }

    function exportReceptionPdf(context) {
        const doc = createPdf();
        const summary = getSummary(context);
        const tableStart = buildHeader(doc, context, "Lista de Recepção");
        buildReceptionSummary(doc, summary, tableStart);
        buildReceptionTable(doc, getConfirmedGuests(context), tableStart + 31);
        savePdf(doc, context.event, "Lista-Recepcao");
    }

    function exportExcel(context) {
        const rows = context.guests.map((guest) => ({
            Convidado: guest.nome ?? "",
            Confirmação: guest.confirmado ? "Confirmado" : "Não confirmado",
            Acompanhantes: Number(guest.acompanhantes || 0),
            Total: Number(guest.acompanhantes || 0) + 1,
            "Data da resposta": guest.dataResposta ?? ""
        }));
        const worksheet = XLSX.utils.json_to_sheet(rows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Convidados");
        XLSX.writeFile(workbook, `${generateFilename(context.event, "Convidados")}.xlsx`);
    }

    function createPdf() {
        return new jspdf.jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    }

    function getConfirmedGuests(context) {
        return context.guests.filter((guest) => guest.confirmado === true);
    }

    function getSummary(context) {
        const confirmedGuests = getConfirmedGuests(context);
        const totalCompanions = confirmedGuests.reduce(
            (total, guest) => total + Number(guest.acompanhantes || 0),
            0
        );
        return {
            totalResponses: context.guests.length,
            totalConfirmed: confirmedGuests.length,
            totalCompanions,
            totalExpected: confirmedGuests.length + totalCompanions
        };
    }

    function buildHeader(doc, context, title) {
        const left = CONFIG.margin;
        const right = doc.internal.pageSize.getWidth() - CONFIG.margin;
        const event = context.event;
        let top = CONFIG.margin;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.setTextColor(...CONFIG.colors.muted);
        doc.text("Documento gerado automaticamente pelo sistema Eventos de Axé.", left, top);

        top += 11;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(18);
        doc.setTextColor(...CONFIG.colors.text);
        doc.text(title, left, top);

        top += 10;
        doc.setFontSize(10);
        writeLabelValue(doc, "Evento:", event.tituloEvento || event.nomeEvento, left, top, 22);
        top += 7;
        writeLabelValue(doc, "Data do evento:", `${formatEventDate(event.data)} às ${event.horario}`, left, top, 32);
        top += 7;
        writeLabelValue(doc, "Documento gerado em:", context.generatedAt.toLocaleString("pt-BR"), left, top, 45);
        top += 6;
        doc.setDrawColor(...CONFIG.colors.line);
        doc.line(left, top, right, top);
        return top + 9;
    }

    function writeLabelValue(doc, label, value, left, top, offset) {
        doc.setFont("helvetica", "bold");
        doc.setTextColor(...CONFIG.colors.text);
        doc.text(label, left, top);
        doc.setFont("helvetica", "normal");
        doc.text(String(value || "-"), left + offset, top);
    }

    function buildOfficialSummary(doc, summary, top) {
        const lines = [
            `Respostas recebidas: ${summary.totalResponses}`,
            `Total de confirmados: ${summary.totalConfirmed}`,
            `Total de recusas: ${summary.totalResponses - summary.totalConfirmed}`,
            `Total de acompanhantes: ${summary.totalCompanions}`,
            `Total de pessoas esperadas: ${summary.totalExpected}`
        ];
        buildSummary(doc, lines, top);
    }

    function buildReceptionSummary(doc, summary, top) {
        const lines = [
            `Total de convidados: ${summary.totalConfirmed}`,
            `Total de acompanhantes: ${summary.totalCompanions}`,
            `Total de pessoas esperadas: ${summary.totalExpected}`
        ];
        buildSummary(doc, lines, top);
    }

    function buildSummary(doc, lines, top) {
        const left = CONFIG.margin;
        const right = doc.internal.pageSize.getWidth() - CONFIG.margin;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(12);
        doc.setTextColor(...CONFIG.colors.text);
        doc.text("Resumo", left, top);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        lines.forEach((line, index) => doc.text(line, left, top + 8 + index * 7));
        const end = top + 8 + lines.length * 7;
        doc.setDrawColor(...CONFIG.colors.line);
        doc.line(left, end, right, end);
    }

    function buildOfficialTable(doc, guests, startY) {
        doc.autoTable({
            startY,
            head: [["Convidado", "Status", "Acompanhantes", "Respondido em"]],
            body: guests.map((guest) => [
                guest.nome || "-",
                "Confirmado",
                Number(guest.acompanhantes || 0),
                guest.dataResposta ? formatDate(guest.dataResposta) : ""
            ]),
            ...tableStyle(),
            columnStyles: {
                0: { cellWidth: 70 },
                1: { cellWidth: 27, halign: "center" },
                2: { cellWidth: 38, halign: "center" },
                3: { cellWidth: 42, halign: "center" }
            }
        });
    }

    function buildReceptionTable(doc, guests, startY) {
        doc.autoTable({
            startY,
            head: [["Convidado", "Acompanhantes", "Check-in"]],
            body: guests.map((guest) => [guest.nome || "-", Number(guest.acompanhantes || 0), ""]),
            ...tableStyle(3),
            columnStyles: {
                0: { cellWidth: 100 },
                1: { cellWidth: 38, halign: "center" },
                2: { cellWidth: 40, halign: "center" }
            }
        });
    }

    function tableStyle(cellPadding = 2) {
        return {
            theme: "grid",
            styles: { font: "helvetica", fontSize: 9, cellPadding, valign: "middle" },
            headStyles: { fillColor: CONFIG.colors.header, textColor: 255, fontStyle: "bold" }
        };
    }

    function savePdf(doc, event, type) {
        doc.save(`${generateFilename(event, type)}.pdf`);
    }

    function generateFilename(event, type) {
        const today = new Date();
        const stamp = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, "0"), String(today.getDate()).padStart(2, "0")].join("-");
        return `${event.slug || "evento"}-${type}-${stamp}`;
    }

    function formatEventDate(date) {
        if (!date) return "-";
        const [year, month, day] = date.split("-");
        if (!day) return date;
        return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("pt-BR");
    }

    function formatDate(date) {
        const value = String(date).trim();
        const brazilianDate = value.match(/^(\d{2})\/(\d{2})\/(\d{4})/);

        if (brazilianDate) {
            return `${brazilianDate[1]}/${brazilianDate[2]}/${brazilianDate[3]}`;
        }

        const parsedDate = new Date(value);

        if (Number.isNaN(parsedDate.getTime())) {
            return value;
        }

        return new Intl.DateTimeFormat("pt-BR").format(parsedDate);
    }

    return { init, exportOfficialPdf, exportReceptionPdf, exportExcel };
})();
