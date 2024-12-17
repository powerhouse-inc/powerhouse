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

type SidebarItemOption = 'duplicate' | 'new-folder' | 'delete' | 'rename';
type ContentViewItemOption =
    | 'duplicate'
    | 'delete'
    | 'rename'
    | 'switchboard-link';

const getOptionName = (option: SidebarItemOption) => {
    switch (option) {
        case 'duplicate':
            return 'Duplicate';
        case 'new-folder':
            return 'New Folder';
        case 'delete':
            return 'Delete';
        case 'rename':
            return 'Rename';
    }
};

const getContentViewOptionName = (option: ContentViewItemOption) => {
    switch (option) {
        case 'duplicate':
            return 'Duplicate';
        case 'delete':
            return 'Delete';
        case 'rename':
            return 'Rename';
        case 'switchboard-link':
            return 'Switchboard Link';
    }
};

export const clickSidebarItemOption = (
    folderName: string,
    option: SidebarItemOption,
) => {
    cy.get('.mr-1')
        .contains(folderName)
        .closest('div')
        .children('button')
        .invoke('removeClass', 'hidden')
        .click()
        .invoke('addClass', 'hidden');

    const optionName = getOptionName(option);
    cy.contains(optionName).click();
};

export const newFolder = (parent: string, folderName: string) => {
    cy.get('.mr-1')
        .contains(parent)
        .closest('div')
        .children('button')
        .invoke('removeClass', 'hidden')
        .click()
        .invoke('addClass', 'hidden');

    cy.contains('New Folder').click();
    cy.get('input[value="New Folder"]').clear().type(`${folderName}{enter}`);

    cy.get('.mr-1')
        .contains(parent)
        .closest('div')
        .children('button')
        .invoke('addClass', 'hidden');
};

export const selectSidebarItem = (item: string) => {
    cy.get('.mr-1').contains(item).click();
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

export const connectDebugMenu = (on = true) => {
    cy.window().then(window => {
        window.localStorage.setItem('CONNECT_DEBUG', on ? 'true' : 'false');
    });

    cy.reload();
};

export const clickContentViewItem = (title: string) => {
    cy.get('#content-view').contains(title).should('be.visible').click();
};

export const clickContentViewItemOption = (
    itemName: string,
    option: ContentViewItemOption,
) => {
    cy.get('#content-view')
        .contains(itemName)
        .parent()
        .next()
        .invoke('attr', 'style', 'display: inline-block; width: 24px')
        .click();

    const optionName = getContentViewOptionName(option);
    cy.contains(optionName).click();
};

export const getBreadcrumbItem = (title: string) => {
    return cy
        .get('#content-view')
        .children()
        .first()
        .children()
        .first()
        .contains(title);
};
