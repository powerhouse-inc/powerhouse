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

export const newFolder = (parent: string, folderName: string) => {
    cy.get('article')
        .contains(parent)
        .then(el => {
            hoverElement(el[0]);
        });

    cy.get('article')
        .contains(parent)
        .closest('article')
        .children('button')
        .click();

    cy.contains('New Folder').click();
    cy.get('input[value="New Folder"]').clear().type(`${folderName}{enter}`);
};

export const selectSidebarItem = (item: string) => {
    cy.get('article').contains(item).click();
};

export const addPublicDrive = (url: string) => {
    cy.intercept('POST', url, req => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        if (req.body.operationName === 'getDrive') {
            req.alias = 'graphqlQuery';
        }
    });

    cy.get('p').contains('Public Drives').parent().find('button').click();
    cy.get('input[placeholder="Drive URL"]').clear().type(url);
    cy.contains('Add existing drive').click();

    cy.wait('@graphqlQuery');
    cy.get('button').contains('Confirm URL').should('not.be.disabled');
    cy.get('button').contains('Confirm URL').click();

    cy.get('button').contains('Add drive').should('not.be.disabled');
    cy.get('button').contains('Add drive').click();
};
