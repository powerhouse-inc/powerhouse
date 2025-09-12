/// <reference types="cypress" />

import {
  addPublicDrive,
  clearIndexDB,
  clickContentViewItem,
  clickContentViewItemOption,
  clickSidebarItemOption,
  connectDebugMenu,
  getBreadcrumbItem,
  newFolder,
  selectSidebarItem,
} from "./utils/index.js";

describe("Navigation", () => {
  const maxRetries = 5;

  const validateGraphQLQuery = (retryCount = 0, expectedStatusCode = 200) => {
    cy.wait("@graphqlQuery").then((interception) => {
      if (interception.response?.statusCode === expectedStatusCode) {
        assert.equal(
          interception.response.statusCode,
          expectedStatusCode,
          `GraphQL query should return a ${expectedStatusCode} status`,
        );
      } else if (retryCount < maxRetries) {
        cy.log(
          `Retry ${retryCount + 1}: GraphQL query failed with status ${interception.response?.statusCode}`,
        );
        validateGraphQLQuery(retryCount + 1, expectedStatusCode);
      } else {
        assert.fail(`GraphQL query failed after ${maxRetries} retries`);
      }
    });
  };

  before(async () => {
    cy.clearAllSessionStorage();
    await clearIndexDB();
  });

  beforeEach(() => {
    cy.visit("http://localhost:5173/");
    cy.window().then((win) => {
      win.localStorage.setItem(
        "/:acceptedCookies",
        '{"analytics":false,"marketing":false,"functional":false}',
      );
      win.localStorage.setItem("/:display-cookie-banner", "false");
    });
  });

  it("should create a default local drive", () => {
    cy.get("p").contains("My Local Drive").should("exist");
  });

  it("should create a folder inside the local drive", () => {
    newFolder("My Local Drive", "My Folder");
    cy.contains("My Folder").should("exist");
  });

  it("should create a new document model", () => {
    newFolder("My Local Drive", "documents");
    cy.contains("documents").click();
    cy.contains("DocumentModel").click();
    cy.get('input[placeholder="Document name"]').clear().type("test-document");
    cy.get("button").contains("Create").click();
    selectSidebarItem("test-document");
    cy.get('textarea[placeholder="Document Model Name"]').type("draft1");

    cy.contains("Global State Schema").click();
    cy.contains("Close").click();
  });

  it("should add public drive", () => {
    const publicDriveUrl = Cypress.env("TEST_PUBLIC_DRIVE") as string;
    const publicDriveName = Cypress.env("TEST_PUBLIC_DRIVE_NAME") as string;

    addPublicDrive(publicDriveUrl);
    cy.contains(".mr-1", publicDriveName).should("be.visible");
    selectSidebarItem(publicDriveName);
  });

  it("should create and delete a folder inside test drive", () => {
    const publicDriveName = Cypress.env("TEST_PUBLIC_DRIVE_NAME") as string;
    selectSidebarItem(publicDriveName);
    newFolder(publicDriveName, "test-folder-delete");
    cy.contains("test-folder-delete").should("exist");

    clickSidebarItemOption("test-folder-delete", "delete");

    cy.contains("button", "Delete").click();
    cy.contains("test-folder-delete").should("not.exist");
  });

  it("should rename a folder inside test drive", () => {
    const publicDriveName = Cypress.env("TEST_PUBLIC_DRIVE_NAME") as string;
    selectSidebarItem(publicDriveName);
    newFolder(publicDriveName, "test-folder");
    clickSidebarItemOption("test-folder", "rename");

    cy.get('input[value="test-folder"]').clear().type("renamed-folder{enter}");
    cy.contains("renamed-folder").should("exist");
    clickSidebarItemOption("renamed-folder", "delete");
    cy.contains("button", "Delete").click();
  });

  it("should duplicate a folder inside test drive", () => {
    const publicDriveName = Cypress.env("TEST_PUBLIC_DRIVE_NAME") as string;
    selectSidebarItem(publicDriveName);
    newFolder(publicDriveName, "test-folder-duplicate");
    clickSidebarItemOption("test-folder-duplicate", "duplicate");

    cy.contains("test-folder-duplicate").should("exist");
    cy.contains("test-folder-duplicate (copy) 1").should("exist");

    clickSidebarItemOption("test-folder-duplicate", "delete");
    cy.contains("button", "Delete").click();

    clickSidebarItemOption("test-folder-duplicate (copy) 1", "delete");
    cy.contains("button", "Delete").click();
  });

  // TODO: need to rewrite this test
  it.skip("should create a document model inside test drive folder", () => {
    const publicDriveName = Cypress.env("TEST_PUBLIC_DRIVE_NAME") as string;
    selectSidebarItem(publicDriveName);

    newFolder(publicDriveName, "test-folder");
    selectSidebarItem("test-folder");
    cy.contains("DocumentModel").click();
    cy.get('input[placeholder="Document name"]').clear().type("test-document");
    cy.get("button").contains("Create").click();
    cy.get('textarea[placeholder="Document Model Name"]').type("draft1");

    cy.contains("Global State Schema").click();
    cy.contains("Close").click();

    cy.contains("draft1").should("exist");

    clickSidebarItemOption("test-folder", "delete");
    cy.contains("button", "Delete").click();
  });

  it("should navigate by clicking folder items in content view", () => {
    const publicDriveName = Cypress.env("TEST_PUBLIC_DRIVE_NAME") as string;
    selectSidebarItem(publicDriveName);

    newFolder(publicDriveName, "test-folder");
    newFolder("test-folder", "test-folder-2");
    newFolder("test-folder-2", "test-folder-3");
    newFolder("test-folder-3", "test-folder-4");

    selectSidebarItem("test-folder");

    clickContentViewItem("test-folder-2");
    clickContentViewItem("test-folder-3");
    clickContentViewItem("test-folder-4");

    clickSidebarItemOption("test-folder", "delete");
    cy.contains("button", "Delete").click();
  });

  it("should navigate using the breadcrumb", () => {
    const publicDriveName = Cypress.env("TEST_PUBLIC_DRIVE_NAME") as string;
    selectSidebarItem(publicDriveName);

    newFolder(publicDriveName, "test-folder");
    newFolder("test-folder", "test-folder-2");
    newFolder("test-folder-2", "test-folder-3");
    newFolder("test-folder-3", "test-folder-4");

    selectSidebarItem("test-folder-4");

    getBreadcrumbItem("test-folder-3").should("be.visible").click();
    getBreadcrumbItem("test-folder-4").should("not.exist");

    getBreadcrumbItem("test-folder-2").should("be.visible").click();
    getBreadcrumbItem("test-folder-3").should("not.exist");

    getBreadcrumbItem("test-folder").should("be.visible").click();
    getBreadcrumbItem("test-folder-2").should("not.exist");

    getBreadcrumbItem(publicDriveName).should("be.visible").click();
    getBreadcrumbItem("test-folder").should("not.exist");

    clickSidebarItemOption("test-folder", "delete");
    cy.contains("button", "Delete").click();
  });

  it("should open switchboard from document link", () => {
    const rwaDocumentCloseSelector = ".justify-between > :nth-child(2) > .grid";
    const rwaSwitchboardLinkSelector =
      '[dir="ltr"] > .justify-between > :nth-child(2) > :nth-child(1)';
    const publicDriveName = Cypress.env("TEST_PUBLIC_DRIVE_NAME") as string;
    selectSidebarItem(publicDriveName);

    newFolder(publicDriveName, "test-folder");
    selectSidebarItem("test-folder");

    cy.contains("RWA Portfolio").click();
    cy.get('input[placeholder="Document name"]').clear().type("rwa-document");
    cy.get("button").contains("Create").click();

    cy.window().then((win) => {
      cy.stub(win, "open").as("windowOpen");
    });

    cy.get(rwaSwitchboardLinkSelector).click();

    cy.get("@windowOpen").should("have.been.called");

    cy.get(rwaDocumentCloseSelector).click();
    cy.contains("rwa-document").should("exist");

    clickSidebarItemOption("test-folder", "delete");
    cy.contains("button", "Delete").click();
  });

  // TODO: check why switchboard link option is not available for files
  it.skip("should open switchboard from file item menu", () => {
    const rwaDocumentCloseSelector = ".justify-between > :nth-child(2) > .grid";
    const publicDriveName = Cypress.env("TEST_PUBLIC_DRIVE_NAME") as string;
    selectSidebarItem(publicDriveName);

    newFolder(publicDriveName, "test-folder");
    selectSidebarItem("test-folder");

    cy.contains("RWA Portfolio").click();
    cy.get('input[placeholder="Document name"]').clear().type("rwa-document");
    cy.get("button").contains("Create").click();
    cy.get(rwaDocumentCloseSelector).click();

    cy.contains("rwa-document").should("exist");

    cy.window().then((win) => {
      cy.stub(win, "open").as("windowOpen");
    });

    clickContentViewItemOption("rwa-document", "switchboard-link");

    cy.get("@windowOpen").should("have.been.called");

    clickSidebarItemOption("test-folder", "delete");
    cy.contains("button", "Delete").click();
  });

  it("should open powerhouse webpage", () => {
    cy.window().then((win) => {
      cy.stub(win, "open").as("windowOpen");
    });

    cy.get("#ph-logo-link").should("be.visible").click();

    cy.get("@windowOpen").should(
      "be.calledWith",
      "https://www.powerhouse.inc/",
      "_blank",
    );
  });

  it("should open settings", () => {
    cy.contains("Settings").click();
    cy.get('div[role="dialog"]').should("be.visible");
    cy.contains("Cancel").click();
    cy.get('div[role="dialog"]').should("not.exist");
  });

  it("should enable/disable connect debug mode", () => {
    connectDebugMenu(true);
    cy.get("#connect-debug-button").should("be.visible");

    connectDebugMenu(false);
    cy.get("#connect-debug-button").should("not.exist");
  });

  it("should register a new pull responder trigger when it becomes invalid", () => {
    const publicDriveName = Cypress.env("TEST_PUBLIC_DRIVE_NAME") as string;
    const publicDriveUrl = Cypress.env("TEST_PUBLIC_DRIVE") as string;

    connectDebugMenu(true);
    cy.get("#connect-debug-button").click();

    cy.intercept("POST", publicDriveUrl, (req) => {
      if (req.body.operationName === "strands") {
        req.alias = "graphqlQuery";
      }
    });

    cy.get("#selectedDrive").click();
    cy.get("#selectedDrive").contains(publicDriveName).click();

    cy.get("#autoRegisterPullResponder").click();
    cy.get("#autoRegisterPullResponder").contains("Disabled").click();

    cy.get("#driveTrigger").click();
    cy.get('div[role="option"]').click();
    cy.contains("button", "Remove Trigger").click();

    cy.get("#driveUrl").clear().type(`${publicDriveUrl}{enter}`);
    cy.contains("button", "Add Invalid Trigger").click();

    validateGraphQLQuery(0, 400);

    cy.get("#autoRegisterPullResponder").click();
    cy.get('div[role="option"]').contains("Enabled").click();

    validateGraphQLQuery(0, 200);

    cy.get("#close-modal").click();
    connectDebugMenu(false);
  });
});
