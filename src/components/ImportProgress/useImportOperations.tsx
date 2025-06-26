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

  const findExistingEntry = useCallback(async (entryData: Record<string, any>, rowIndex: number): Promise<any> => {
    try {
      // Try to find by title first (most common unique identifier)
      const titleField = entryData.title || entryData.name || entryData.slug;
      
      if (!titleField) {
        addLog('No unique identifier found (title/name/slug), will create new entry', 'info', undefined, rowIndex);
        return null;
      }

      const searchUrl = `${config.host}/v3/content_types/${config.contentType}/entries?query={"title":"${titleField}"}`;
      const headers = {
        'api_key': config.apiKey,
        'authorization': config.managementToken,
        'Content-Type': 'application/json'
      };

      const response = await fetch(searchUrl, {
        method: 'GET',
        headers: headers
      });

      if (!response.ok) {
        addLog('Failed to search for existing entries, will create new entry', 'warning', undefined, rowIndex);
        return null;
      }

      const searchResult = await response.json();
      
      if (searchResult.entries && searchResult.entries.length > 0) {
        const existingEntry = searchResult.entries[0];
        addLog(`Found existing entry with UID: ${existingEntry.uid}`, 'info', undefined, rowIndex);
        return existingEntry;
      }

      return null;
    } catch (error) {
      addLog('Error searching for existing entries, will create new entry', 'warning', error, rowIndex);
      return null;
    }
  }, [config]);

  const compareEntryData = useCallback((existingData: any, newData: any): boolean => {
    // Simple comparison - check if any field values are different
    for (const key in newData) {
      if (newData[key] !== existingData[key]) {
        // For nested objects, do a shallow comparison
        if (typeof newData[key] === 'object' && typeof existingData[key] === 'object') {
          if (JSON.stringify(newData[key]) !== JSON.stringify(existingData[key])) {
            return false; // Data is different
          }
        } else {
          return false; // Data is different
        }
      }
    }
    return true; // Data is the same
  }, []);

  const updateExistingEntry = useCallback(async (entryUid: string, entryData: Record<string, any>, rowIndex: number): Promise<any> => {
    try {
      const updateUrl = `${config.host}/v3/content_types/${config.contentType}/entries/${entryUid}`;
      const headers = {
        'api_key': config.apiKey,
        'authorization': config.managementToken,
        'Content-Type': 'application/json'
      };

      const entryPayload = { entry: entryData };

      const response = await fetch(updateUrl, {
        method: 'PUT',
        headers: headers,
        body: JSON.stringify(entryPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Error updating entry: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }, [config]);

  const createNewEntry = useCallback(async (entryData: Record<string, any>, rowIndex: number): Promise<any> => {
    try {
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
        throw new Error(`Error creating entry: ${errorText}`);
      }

      return await response.json();
    } catch (error) {
      throw error;
    }
  }, [config]);

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
        console.log(`🔍 SELECT DEBUG: Processing select field "${mapping.contentstackField}"`);
        console.log(`🔍 SELECT DEBUG: CSV value: "${value}"`);
        console.log(`🔍 SELECT DEBUG: Available options:`, mapping.selectOptions);
        
        // Try exact match first
        let matchedOption = mapping.selectOptions.find(option => 
          option.value === value || option.text === value
        );
        
        if (!matchedOption) {
          // Try case-insensitive match
          matchedOption = mapping.selectOptions.find(option => 
            option.value.toLowerCase() === value.toLowerCase() || 
            option.text.toLowerCase() === value.toLowerCase()
          );
        }
        
        if (!matchedOption) {
          // Try partial match
          matchedOption = mapping.selectOptions.find(option => 
            option.value.toLowerCase().includes(value.toLowerCase()) || 
            option.text.toLowerCase().includes(value.toLowerCase()) ||
            value.toLowerCase().includes(option.value.toLowerCase()) ||
            value.toLowerCase().includes(option.text.toLowerCase())
          );
        }
        
        if (matchedOption) {
          console.log(`🔍 SELECT DEBUG: Found match: "${matchedOption.value}" (${matchedOption.text})`);
          return matchedOption.value;
        } else {
          console.warn(`🔍 SELECT DEBUG: No match found for "${value}" in select field "${mapping.contentstackField}"`);
          console.warn(`🔍 SELECT DEBUG: Available options:`, mapping.selectOptions.map(opt => `"${opt.value}" (${opt.text})`));
          return null;
        }
      } else {
        console.warn(`🔍 SELECT DEBUG: No select options available for field "${mapping.contentstackField}"`);
        return value; // Return as-is if no options defined
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
              addLog(`Skipping select field "${mapping.contentstackField}" (no matching option for: "${csvValue}")`, 'warning', undefined, rowIndex);
            }
            continue;
          }

          // Handle global fields - wrap in nested object structure
          if (mapping.fieldType === 'global_field') {
            const globalFieldData = { [mapping.contentstackField.split('.').pop()!]: transformedValue };
            entryData = mergeNestedData(entryData, globalFieldData, mapping.contentstackField.split('.')[0]);
            addLog(`Global field "${mapping.contentstackField}" structured as nested object`, 'info', JSON.stringify(globalFieldData), rowIndex);
          } else {
            entryData = mergeNestedData(entryData, transformedValue, mapping.contentstackField);
          }
          
          // Add specific logging for select fields
          if (mapping.fieldType === 'select') {
            addLog(`Select field "${mapping.contentstackField}" set to: "${transformedValue}"`, 'info', undefined, rowIndex);
          }
        }
      }

      addLog(`Entry data structure: ${JSON.stringify(entryData, null, 2)}`, 'info', JSON.stringify(entryData, null, 2), rowIndex);

      // Check if entry already exists
      const existingEntry = await findExistingEntry(entryData, rowIndex);
      
      let responseData;
      let isUpdate = false;

      if (existingEntry) {
        // Compare data to see if update is needed
        const isSameData = compareEntryData(existingEntry, entryData);
        
        if (isSameData) {
          addLog(`Entry already exists with same data, skipping`, 'info', undefined, rowIndex);
          return { rowIndex, success: true, entryUid: existingEntry.uid, skipped: true };
        } else {
          // Update existing entry
          addLog(`Updating existing entry with UID: ${existingEntry.uid}`, 'info', undefined, rowIndex);
          responseData = await updateExistingEntry(existingEntry.uid, entryData, rowIndex);
          isUpdate = true;
        }
      } else {
        // Create new entry
        addLog(`Creating new entry`, 'info', undefined, rowIndex);
        responseData = await createNewEntry(entryData, rowIndex);
      }

      const entryUid = responseData.entry.uid;
      const action = isUpdate ? 'updated' : 'created';
      addLog(`Entry ${action} successfully with UID: ${entryUid}`, 'success', undefined, rowIndex);

      if (config.shouldPublish) {
        try {
          const publishResult = await publishEntry(entryUid);
          addLog(`Entry published successfully`, 'published', publishResult, rowIndex);
          return { rowIndex, success: true, entryUid, published: true, publishResult, updated: isUpdate };
        } catch (publishError: any) {
          addLog(`Failed to publish entry: ${publishError.message || publishError}`, 'error', publishError, rowIndex);
          return { rowIndex, success: true, entryUid, published: false, error: publishError.message || publishError, updated: isUpdate };
        }
      }

      return { rowIndex, success: true, entryUid, updated: isUpdate };
    } catch (error: any) {
      addLog(`Unexpected error: ${error.message || error}`, 'error', error, rowIndex);
      return { rowIndex, success: false, error: error.message || error };
    }
  }, [config, fieldMapping, transformValue, findExistingEntry, compareEntryData, updateExistingEntry, createNewEntry]);

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
    const createdCount = importResults.filter(r => r.success && !r.updated && !r.skipped).length;
    const updatedCount = importResults.filter(r => r.updated).length;
    const skippedCount = importResults.filter(r => r.skipped).length;
    const publishedCount = importResults.filter(r => r.published).length;
    const errorCount = importResults.filter(r => !r.success).length;

    addLog(`Import completed: ${successCount} successful (${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped), ${publishedCount} published, ${errorCount} failed`, 
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
