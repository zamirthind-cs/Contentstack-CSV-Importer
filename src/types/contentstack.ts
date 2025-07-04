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
  fieldType: 'text' | 'number' | 'boolean' | 'date' | 'reference' | 'file' | 'blocks' | 'global_field' | 'link' | 'select';
  isRequired: boolean;
  referenceContentType?: string;
  blockType?: string;
  parentField?: string;
  selectOptions?: SelectOption[];
}

export interface ImportResult {
  rowIndex: number;
  success: boolean;
  entryUid?: string;
  error?: string;
  published?: boolean;
  publishResult?: any;
  updated?: boolean;
  skipped?: boolean;
}

export interface ContentstackField {
  uid: string;
  display_name: string;
  data_type: string;
  mandatory: boolean;
  reference_to?: string[];
  blocks?: BlockSchema[];
  schema?: ContentstackField[];
  enum?: SelectOption[];
}

export interface SelectOption {
  value: string;
  text: string;
}

export interface BlockSchema {
  title: string;
  uid: string;
  schema: ContentstackField[];
}

export interface FlattenedField {
  uid: string;
  display_name: string;
  data_type: string;
  mandatory: boolean;
  reference_to?: string[];
  fieldPath: string;
  parentField?: string;
  blockType?: string;
  selectOptions?: SelectOption[];
}
