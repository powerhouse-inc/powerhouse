import { generateEditor, generateFromDocument, validateDocumentModelState } from "@powerhousedao/codegen";
import { getConfig } from "@powerhousedao/config/utils";
import { type IProcessor } from "document-drive/processors/types";
import { type InternalTransmitterUpdate } from "document-drive/server/listener/transmitter/internal";
import { type DocumentModelDocument, type DocumentModelState } from "document-model";
import { type DocumentEditorState } from "../../document-models/document-editor/index.js";

const PH_CONFIG = getConfig();

export class CodegenProcessor implements IProcessor {
  async onStrands<TDocument extends DocumentModelDocument>(
    strands: InternalTransmitterUpdate<TDocument>[],
  ): Promise<void> {
    console.log(">>> onStrands", strands);

    // TODO: refactor document handlers into a class
    
    // Process document models first to ensure they exist before generating editors
    const documentModelStrands = strands.filter(s => s.documentType === "powerhouse/document-model");
    const otherStrands = strands.filter(s => s.documentType !== "powerhouse/document-model");
    
    // Process document models first
    for (const strand of documentModelStrands) {
      if (strand.documentType === "powerhouse/document-model") {
        const state = strand.state as DocumentModelState;
        const validationResult = validateDocumentModelState(state);
    
        if (validationResult.isValid) {
          console.log(`🔄 Starting code generation for document model: ${state.name}`);
          try {
            await generateFromDocument(state, PH_CONFIG, { verbose: false });
            console.log(`✅ Code generation completed successfully for: ${state.name}`);
          } catch (error) {
            console.error(`❌ Error during code generation for ${state.name}:`, error);
          }
        } else {
          console.error(`❌ Validation failed for document model: ${state.name}`, validationResult.errors);
        }
      }
    }
    
    // Then process other document types
    for (const strand of otherStrands) {
      if (strand.documentType === "powerhouse/package") {
        console.log(">>> generate powerhouse/package", strand.state);
      } else if (strand.documentType === "powerhouse/document-editor") {
        const state = strand.state as DocumentEditorState;
        
        // Check if we have a valid editor name and document types
        if (state.name && state.documentTypes.length > 0) {
          console.log(`🔄 Starting editor generation for: ${state.name}`);
          try {
            // Extract document types from the state
            const documentTypes = state.documentTypes.map(dt => dt.documentType);
            
            // Generate the editor using the codegen function
            await generateEditor(state.name, documentTypes, PH_CONFIG);
            
            console.log(`✅ Editor generation completed successfully for: ${state.name}`);
          } catch (error) {
            console.error(`❌ Error during editor generation for ${state.name}:`, error);
            if (error instanceof Error) {
              console.error(`❌ Error message: ${error.message}`);
            }
          }
        } else {
          console.warn(`⚠️ Skipping editor generation - missing name or document types for editor`);
        }
      } else {
        console.log(">>> unknown document type", strand.documentType);
      }
    }
  }

  async onDisconnect() {}
}
