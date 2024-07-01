/// <reference types="cypress" />

import { clearIndexDB, newFolder } from './utils';

describe('Navigation', () => {
    before(async () => {
        cy.clearAllSessionStorage();
        await clearIndexDB();
    });

    beforeEach(() => {
        cy.visit('http://localhost:5173/');
    });

    it('should create a default local drive', () => {
        cy.get('article').contains('My Local Drive').should('exist');
    });

    it('should create a folder inside the local drive', () => {
        newFolder('My Local Drive', 'My Folder');
        cy.contains('My Folder').should('exist');
    });

    it('should create a new document model', () => {
        newFolder('My Local Drive', 'documents');
        cy.contains('documents').click();
        cy.contains('DocumentModel').click();
        cy.get('input[placeholder="Document name"]')
            .clear()
            .type('test-document');
        cy.get('button').contains('Create').click();
        cy.get('textarea[placeholder="Document Model Name"]').type('draft1');

        cy.contains('Global State Schema').click();
        cy.contains('Close').click();
    });

    // it.only('should add public drive', () => {
    //     addPublicDrive(
    //         'https://apps.powerhouse.io/powerhouse/switchboard/d/powerhouse',
    //     );
    //     cy.contains('article', 'Powerhouse').should('be.visible');
    //     selectSidebarItem('Powerhouse');
    // });
});
