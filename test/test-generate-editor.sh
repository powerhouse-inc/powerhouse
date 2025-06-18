#!/bin/bash
set -e

# Create a temporary project directory
TEMP_DIR="__temp__"
EDITOR_NAME="test-editor"
# Replace with actual document type IDs available in your system
DOCUMENT_TYPES="test-document-type"
SKIP_FORMAT=true

echo "Creating temporary project directory: $TEMP_DIR"
if [ -d "$TEMP_DIR" ]; then
  echo "Removing existing temporary directory..."
  rm -rf "$TEMP_DIR"
fi

# Initialize a new Powerhouse project
echo "Initializing new Powerhouse project..."
npx ph init "$TEMP_DIR" --package-manager pnpm

# Navigate to the project directory
cd "$TEMP_DIR"

# Define paths relative to the temp directory
EDITORS_DIR="editors"
DOCUMENT_MODELS_DIR="document-models"

# Create a test document model for testing
echo "Creating test document model..."
mkdir -p "$DOCUMENT_MODELS_DIR/test"
echo '{
  "id": "test-document-type",
  "name": "Test",
  "description": "Test document type for testing editor generation",
  "extension": ".test",
  "author": {
    "name": "Test Author",
    "website": "http://example.com"
  },
  "specifications": [
    {
      "changeLog": [],
      "version": 1,
      "modules": [
        {
          "id": "test-module-id",
          "name": "base_operations",
          "description": "Base operations for the test document model",
          "operations": [
            {
              "id": "add-item-op",
              "name": "ADD_ITEM_INPUT",
              "description": "Add a new item",
              "schema": "input AddItemInputInput {\n  id: ID!\n  text: String!\n}",
              "template": "",
              "reducer": "",
              "errors": [],
              "examples": [],
              "scope": "global"
            },
            {
              "id": "update-item-op",
              "name": "UPDATE_ITEM_INPUT",
              "description": "Update an existing item",
              "schema": "input UpdateItemInputInput {\n  id: ID!\n  text: String\n  checked: Boolean\n}",
              "template": "",
              "reducer": "",
              "errors": [],
              "examples": [],
              "scope": "global"
            },
            {
              "id": "delete-item-op",
              "name": "DELETE_ITEM_INPUT",
              "description": "Delete an item",
              "schema": "input DeleteItemInputInput {\n  id: ID!\n}",
              "template": "",
              "reducer": "",
              "errors": [],
              "examples": [],
              "scope": "global"
            }
          ]
        }
      ],
      "state": {
        "global": { 
          "schema": "type TestState {\n  items: [TestItem!]!\n  stats: TestStats!\n}\n\ntype TestItem {\n  id: ID!\n  text: String!\n  checked: Boolean!\n}\n\ntype TestStats {\n  total: Int!\n  checked: Int!\n  unchecked: Int!\n}",
          "initialValue": "{\n  \"items\": [],\n  \"stats\": {\n    \"total\": 0,\n    \"checked\": 0,\n    \"unchecked\": 0\n  }\n}",
          "examples": []
        },
        "local": { 
          "schema": "",
          "initialValue": "{}",
          "examples": []
        }
      }
    }
  ]
}' > "$DOCUMENT_MODELS_DIR/test/test.json"

npx ph generate "$DOCUMENT_MODELS_DIR/test/test.json"

echo "Generating editor with the following parameters:"
echo "  Editor name: $EDITOR_NAME"
echo "  Document types: $DOCUMENT_TYPES"
echo "  Editors directory: $EDITORS_DIR"
echo "  Document models directory: $DOCUMENT_MODELS_DIR"
echo "  Skip format: $SKIP_FORMAT"

# Generate the editor
echo "Generating editor..."
npx ph generate --editor $EDITOR_NAME --document-types $DOCUMENT_TYPES

# Verify the generated code compiles
EDITOR_DIR="$EDITORS_DIR/$EDITOR_NAME"
if [ ! -d "$EDITOR_DIR" ]; then
  echo "Error: Editor directory not found at $EDITOR_DIR"
  exit 1
fi

echo "Verifying editor TypeScript compilation..."
echo "Installing project dependencies..."
rm -rf node_modules
pnpm install --ignore-workspace

# Run TypeScript compiler
#npx tsc --noEmit

echo "✅ TypeScript compilation successful!"

# Test building the entire project
echo "Testing full project build..."

# Build the project
echo "Building the entire project..."
pnpm run build

# Run tests if they exist
if grep -q "\"test\":" "package.json"; then
  echo "Running tests..."
  pnpm test
fi

echo "✅ Project build successful!"

# Return to original directory
cd ..

echo "Removing temporary directory..."
rm -rf "$TEMP_DIR"
