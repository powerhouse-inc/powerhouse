export const hoverElement = (element: HTMLElement) => {
    triggerMouseEventOnElement(element, 'mousemove');
};

export const triggerMouseEventOnElement = (
    element: HTMLElement,
    eventType: string,
) => {
    const rect = element.getBoundingClientRect();
    const clientX = rect.left + rect.width / 2;
    const clientY = rect.top + rect.height / 2;

    // Create and dispatch the mouse event
    const event = new MouseEvent(eventType, {
        view: window,
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
    });

    element.dispatchEvent(event);
};

export const clearIndexDB = async () => {
    const databases = await indexedDB.databases();

    for (const db of databases) {
        indexedDB.deleteDatabase(db.name);
    }
};

export const newFolder = (driveName: string, folderName: string) => {
    cy.get('article')
        .contains(driveName)
        .then(el => {
            hoverElement(el[0]);
        });

    cy.get('article')
        .contains(driveName)
        .closest('article')
        .children('button')
        .click();

    cy.contains('New Folder').click();
    cy.get('input[value="New Folder"]').clear().type(`${folderName}{enter}`);
};
