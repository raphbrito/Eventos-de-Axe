/** Dados e apresentação do rodapé institucional do projeto. */
const system = {
    name: "Eventos de Axé",
    description: "Plataforma para gerenciamento de convites, RSVP e eventos de comunidades de matriz africana.",
    developer: {
        name: "Rafael Brito",
        instagram: "http://instagram.com/raphbrito",
        github: "https://github.com/raphbrito",
        repository: "https://github.com/raphbrito/Eventos-de-Axe"
    },
    version: "1.0.0"
};

function initializeSystemFooter() {
    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };
    const setLink = (id, value) => {
        const element = document.getElementById(id);
        if (element && value) element.href = value;
    };

    setText("systemName", system.name);
    setText("systemDescription", system.description);
    setText("systemDeveloper", system.developer.name);
    setLink("systemDeveloper", system.developer.instagram);
    setLink("systemGithub", system.developer.github);
    setLink("systemRepository", system.developer.repository);
}

initializeSystemFooter();