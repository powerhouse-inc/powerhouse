import { describe, expect, it } from "vitest";
import {
  CreateDocumentRequiredError,
  DocumentDeletedError,
  DowngradeNotSupportedError,
  InvalidSignatureError,
  UpgradeManifestNotFoundError,
} from "../../src/shared/errors.js";

describe("errors", () => {
  describe("DocumentDeletedError", () => {
    it("should create error with document ID and deletion timestamp", () => {
      const error = new DocumentDeletedError("doc-123", "2023-01-15T10:30:00Z");

      expect(error.name).toBe("DocumentDeletedError");
      expect(error.documentId).toBe("doc-123");
      expect(error.deletedAtUtcIso).toBe("2023-01-15T10:30:00Z");
      expect(error.message).toBe(
        "Document doc-123 was deleted at 2023-01-15T10:30:00Z",
      );
    });

    it("should create error with document ID only", () => {
      const error = new DocumentDeletedError("doc-456");

      expect(error.name).toBe("DocumentDeletedError");
      expect(error.documentId).toBe("doc-456");
      expect(error.deletedAtUtcIso).toBeNull();
      expect(error.message).toBe("Document doc-456 has been deleted");
    });

    it("should create error with null deletion timestamp", () => {
      const error = new DocumentDeletedError("doc-789", null);

      expect(error.documentId).toBe("doc-789");
      expect(error.deletedAtUtcIso).toBeNull();
      expect(error.message).toBe("Document doc-789 has been deleted");
    });

    it("should have a stack trace", () => {
      const error = new DocumentDeletedError("doc-123", "2023-01-15T10:30:00Z");
      expect(error.stack).toBeDefined();
    });

    it("should be an instance of Error", () => {
      const error = new DocumentDeletedError("doc-123");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("CreateDocumentRequiredError", () => {
    it("should create error with document ID and scope", () => {
      const error = new CreateDocumentRequiredError("doc-123", "global");

      expect(error.name).toBe("CreateDocumentRequiredError");
      expect(error.documentId).toBe("doc-123");
      expect(error.scope).toBe("global");
      expect(error.message).toBe(
        'Document doc-123 requires a CREATE_DOCUMENT operation at revision 0 in the "document" scope before operations can be added to scope "global"',
      );
    });

    it("should handle different scopes", () => {
      const error = new CreateDocumentRequiredError("doc-456", "local");

      expect(error.documentId).toBe("doc-456");
      expect(error.scope).toBe("local");
      expect(error.message).toContain('scope "local"');
    });

    it("should have a stack trace", () => {
      const error = new CreateDocumentRequiredError("doc-123", "global");
      expect(error.stack).toBeDefined();
    });

    it("should be an instance of Error", () => {
      const error = new CreateDocumentRequiredError("doc-123", "global");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("InvalidSignatureError", () => {
    it("should create error with document ID and reason", () => {
      const error = new InvalidSignatureError(
        "doc-123",
        "signature verification failed",
      );

      expect(error.name).toBe("InvalidSignatureError");
      expect(error.documentId).toBe("doc-123");
      expect(error.reason).toBe("signature verification failed");
      expect(error.message).toBe(
        "Invalid signature in document doc-123: signature verification failed",
      );
    });

    it("should handle different reasons", () => {
      const error = new InvalidSignatureError(
        "doc-456",
        "signer not authorized",
      );

      expect(error.documentId).toBe("doc-456");
      expect(error.reason).toBe("signer not authorized");
      expect(error.message).toContain("signer not authorized");
    });

    it("should have a stack trace", () => {
      const error = new InvalidSignatureError("doc-123", "test reason");
      expect(error.stack).toBeDefined();
    });

    it("should be an instance of Error", () => {
      const error = new InvalidSignatureError("doc-123", "test reason");
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("DowngradeNotSupportedError", () => {
    it("should create error with document type and versions", () => {
      const error = new DowngradeNotSupportedError(
        "powerhouse/document-drive",
        3,
        2,
      );

      expect(error.name).toBe("DowngradeNotSupportedError");
      expect(error.documentType).toBe("powerhouse/document-drive");
      expect(error.fromVersion).toBe(3);
      expect(error.toVersion).toBe(2);
      expect(error.message).toBe(
        "Downgrade not supported for powerhouse/document-drive: cannot upgrade from version 3 to 2",
      );
    });

    it("should handle different document types", () => {
      const error = new DowngradeNotSupportedError("makerdao/budget", 5, 1);

      expect(error.documentType).toBe("makerdao/budget");
      expect(error.fromVersion).toBe(5);
      expect(error.toVersion).toBe(1);
    });

    it("should have a stack trace", () => {
      const error = new DowngradeNotSupportedError("test/type", 2, 1);
      expect(error.stack).toBeDefined();
    });

    it("should be an instance of Error", () => {
      const error = new DowngradeNotSupportedError("test/type", 2, 1);
      expect(error).toBeInstanceOf(Error);
    });
  });

  describe("UpgradeManifestNotFoundError", () => {
    it("should create error with document type", () => {
      const error = new UpgradeManifestNotFoundError(
        "powerhouse/document-drive",
      );

      expect(error.name).toBe("UpgradeManifestNotFoundError");
      expect(error.documentType).toBe("powerhouse/document-drive");
      expect(error.message).toBe(
        "No upgrade manifest registered for document type: powerhouse/document-drive",
      );
    });

    it("should handle different document types", () => {
      const error = new UpgradeManifestNotFoundError("makerdao/budget");

      expect(error.documentType).toBe("makerdao/budget");
      expect(error.message).toContain("makerdao/budget");
    });

    it("should have a stack trace", () => {
      const error = new UpgradeManifestNotFoundError("test/type");
      expect(error.stack).toBeDefined();
    });

    it("should be an instance of Error", () => {
      const error = new UpgradeManifestNotFoundError("test/type");
      expect(error).toBeInstanceOf(Error);
    });
  });
});
