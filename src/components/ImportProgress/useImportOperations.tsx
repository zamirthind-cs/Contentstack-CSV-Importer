
import { useState, useCallback } from 'react';
import { ContentstackConfig, CsvData, FieldMapping, ImportResult } from '@/types/contentstack';
import { transformNestedValue, mergeNestedData } from '@/utils/fieldUtils';

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'published';
  data?: string;
  rowIndex?: number;
}

export const useImportOperations = (
  csvData: CsvData,
  config: ContentstackConfig,
  fieldMapping: FieldMapping[],
  onImportComplete: (results: ImportResult[]) => void,
  setIsImporting: React.Dispatch<React.SetStateAction<boolean>>
) => {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (message: string, type: 'info' | 'warning' | 'error' | 'success' | 'published' = 'info', data?: any, rowIndex?: number) => {
    const logEntry: LogEntry = {
      timestamp: new Date().toLocaleTimeString(),
      message,
      type,
      data: data ? JSON.stringify(data, null, 2) : undefined,
      rowIndex
    };
    setLogs(prev => [...prev, logEntry]);
  };

  const transformValue = useCallback(async (value: string, mapping: FieldMapping): Promise<any> => {
    if (value === null || value === undefined) {
      return null;
    }

    if (mapping.fieldType === 'file') {
      if (typeof value === 'string' && value.trim() !== '') {
        console.warn(`File field "${mapping.contentstackField}" contains filename "${value}" but no actual file upload. Skipping this field.`);
        return null;
      }
      return null;
    }

    if (mapping.fieldType === 'number') {
      const parsedValue = Number(value);
      return isNaN(parsedValue) ? null : parsedValue;
    }

    if (mapping.fieldType === 'boolean') {
      const lowerValue = value.toLowerCase();
      if (lowerValue === 'true' || lowerValue === '1') return true;
      if (lowerValue === 'false' || lowerValue === '0') return false;
      return null;
    }

    if (mapping.fieldType === 'date') {
      try {
        return new Date(value).toISOString();
      } catch (error) {
        console.warn(`Invalid date format: ${value}`);
        return null;
      }
    }

    if (mapping.fieldType === 'select') {
      if (mapping.selectOptions && mapping.selectOptions.length > 0) {
        const matchedOption = mapping.selectOptions.find(option => 
          option.value.toLowerCase() === value.toLowerCase() || 
          option.text.toLowerCase() === value.toLowerCase()
        );
        
        if (matchedOption) {
          return matchedOption.value;
        } else {
          console.warn(`Select field value "${value}" does not match any available options:`, mapping.selectOptions);
          return null;
        }
      }
    }

    return value;
  }, []);

  const publishEntry = async (entryUid: string) => {
    const publishUrl = `${config.host}/v3/content_types/${config.contentType}/entries/${entryUid}/publish`;
    const publishHeaders = {
      'api_key': config.apiKey,
      'authorization': config.managementToken,
      'Content-Type': 'application/json'
    };

    const publishPayload = {
      entry: {
        environments: [config.environment],
        locale: 'en-us'
      }
    };

    const publishResponse = await fetch(publishUrl, {
      method: 'POST',
      headers: publishHeaders,
      body: JSON.stringify(publishPayload)
    });

    if (!publishResponse.ok) {
      const errorText = await publishResponse.text();
      throw new Error(`Error publishing entry: ${errorText}`);
    }

    return await publishResponse.json();
  };

  const handleCreateOrUpdateEntry = useCallback(async (
    row: Record<string, string>,
    rowIndex: number
  ): Promise<ImportResult> => {
    try {
      let entryData: Record<string, any> = {};

      for (const mapping of fieldMapping) {
        if (mapping.contentstackField === 'skip') continue;

        const csvValue = row[mapping.csvColumn];
        if (!csvValue && mapping.isRequired) {
          addLog(`Required field "${mapping.contentstackField}" is missing.`, 'warning', undefined, rowIndex);
          return { rowIndex, success: false, error: `Missing required field: ${mapping.contentstackField}` };
        }

        if (csvValue) {
          const transformedValue = await transformNestedValue(csvValue, mapping.contentstackField, mapping, transformValue);
          
          if (transformedValue === null) {
            if (mapping.fieldType === 'file') {
              addLog(`Skipping file field "${mapping.contentstackField}" (contains filename: "${csvValue}")`, 'info', undefined, rowIndex);
            } else if (mapping.fieldType === 'select') {
              addLog(`Skipping select field "${mapping.contentstackField}" (invalid option: "${csvValue}")`, 'warning', undefined, rowIndex);
            }
            continue;
          }

          if (mapping.fieldType === 'global_field') {
            const globalFieldData = { [mapping.contentstackField.split('.').pop()!]: transformedValue };
            entryData = mergeNestedData(entryData, globalFieldData, mapping.contentstackField.split('.')[0]);
            addLog(`Global field "${mapping.contentstackField}" structured as nested object`, 'info', JSON.stringify(globalFieldData), rowIndex);
          } else {
            entryData = mergeNestedData(entryData, transformedValue, mapping.contentstackField);
          }
        }
      }

      addLog(`Entry data structure: ${JSON.stringify(entryData, null, 2)}`, 'info', JSON.stringify(entryData, null, 2), rowIndex);

      const url = `${config.host}/v3/content_types/${config.contentType}/entries`;
      const headers = {
        'api_key': config.apiKey,
        'authorization': config.managementToken,
        'Content-Type': 'application/json'
      };

      const entryPayload = { entry: entryData };

      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(entryPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        addLog(`Failed to create entry: ${errorText}`, 'error', errorText, rowIndex);
        return { rowIndex, success: false, error: errorText };
      }

      const responseData = await response.json();
      const entryUid = responseData.entry.uid;
      addLog(`Entry created successfully with UID: ${entryUid}`, 'success', undefined, rowIndex);

      if (config.shouldPublish) {
        try {
          const publishResult = await publishEntry(entryUid);
          addLog(`Entry published successfully`, 'published', publishResult, rowIndex);
          return { rowIndex, success: true, entryUid, published: true, publishResult };
        } catch (publishError: any) {
          addLog(`Failed to publish entry: ${publishError.message || publishError}`, 'error', publishError, rowIndex);
          return { rowIndex, success: true, entryUid, published: false, error: publishError.message || publishError };
        }
      }

      return { rowIndex, success: true, entryUid };
    } catch (error: any) {
      addLog(`Unexpected error: ${error.message || error}`, 'error', error, rowIndex);
      return { rowIndex, success: false, error: error.message || error };
    }
  }, [config, fieldMapping, transformValue]);

  const startImport = useCallback(async () => {
    setIsImporting(true);
    setLogs([]);

    const totalRows = csvData.rows.length;
    const mappedFieldsCount = fieldMapping.filter(mapping => mapping.contentstackField !== 'skip').length;

    addLog(`Starting import of ${totalRows} rows with ${mappedFieldsCount} mapped fields`, 'info');

    const importResults: ImportResult[] = [];

    for (let i = 0; i < csvData.rows.length; i++) {
      const row = csvData.rows[i];
      addLog(`Processing row ${i + 1}...`, 'info', undefined, i);
      
      const result = await handleCreateOrUpdateEntry(row, i);
      importResults.push(result);
    }

    const successCount = importResults.filter(r => r.success).length;
    const publishedCount = importResults.filter(r => r.published).length;
    const errorCount = importResults.filter(r => !r.success).length;

    addLog(`Import completed: ${successCount} successful, ${publishedCount} published, ${errorCount} failed`, 
           errorCount > 0 ? 'warning' : 'success');

    setIsImporting(false);
    onImportComplete(importResults);
  }, [csvData, config, fieldMapping, onImportComplete, handleCreateOrUpdateEntry, setIsImporting]);

  return {
    logs,
    setLogs,
    startImport
  };
};
