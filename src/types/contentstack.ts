export interface ContentstackConfig {
  apiKey: string;
  managementToken: string;
  host: string;
  contentType: string;
  shouldPublish: boolean;
  environment?: string;
  schema?: ContentstackField[];
}

export interface CsvData {
  headers: string[];
  rows: Record<string, string>[];
}

export interface FieldMapping {
  csvColumn: string;
  contentstackField: string;
  fieldType: 'text' | 'number' | 'boolean' | 'date' | 'reference' | 'file';
  isRequired: boolean;
  referenceContentType?: string;
}

export interface ImportResult {
  rowIndex: number;
  success: boolean;
  entryUid?: string;
  error?: string;
  published?: boolean;
}

export interface ContentstackField {
  uid: string;
  display_name: string;
  data_type: string;
  mandatory: boolean;
  reference_to?: string[];
}
