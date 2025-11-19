export interface DocumentBasicData {
  documentType: string;
  authorName: string;
  description: string;
  authorWebsite: string;
  extension: string;
  global?: {
    schema: string;
    initialState: string;
  };
  modules?: {
    name: string;
    operations: {
      name: string;
      schema: string;
      description?: string;
      exceptions?: string[];
    }[];
  }[];
}
