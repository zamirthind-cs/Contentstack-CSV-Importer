import React, { useState, useEffect, useCallback } from 'react';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, XCircle, AlertTriangle, Info, Eye, Globe } from "lucide-react";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ContentstackConfig,
  CsvData,
  FieldMapping,
  ImportResult
} from '@/types/contentstack';
import { transformNestedValue, mergeNestedData } from '@/utils/fieldUtils';

interface ImportProgressProps {
  csvData: CsvData;
  config: ContentstackConfig;
  fieldMapping: FieldMapping[];
  onImportComplete: (results: ImportResult[]) => void;
  isImporting: boolean;
  setIsImporting: React.Dispatch<React.SetStateAction<boolean>>;
}

interface LogEntry {
  timestamp: string;
  message: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'published';
  data?: string;
  rowIndex?: number;
}

const ImportProgress: React.FC<ImportProgressProps> = ({
  csvData,
  config,
  fieldMapping,
  onImportComplete,
  isImporting,
  setIsImporting
}) => {
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isPublishing, setIsPublishing] = useState(false);
  const [filterText, setFilterText] = useState('');

  const totalRows = csvData.rows.length;
  const mappedFieldsCount = fieldMapping.filter(mapping => mapping.contentstackField !== 'skip').length;

  const filteredLogs = logs.filter(log =>
    log.message.toLowerCase().includes(filterText.toLowerCase()) ||
    (log.data && log.data.toLowerCase().includes(filterText.toLowerCase()))
  );

  const getLogIcon = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
      case 'published':
        return <Globe className="h-4 w-4 text-blue-600" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getLogBadge = (type: LogEntry['type']) => {
    switch (type) {
      case 'success':
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">SUCCESS</Badge>;
      case 'error':
        return <Badge className="bg-red-100 text-red-800 hover:bg-red-100">ERROR</Badge>;
      case 'warning':
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">WARNING</Badge>;
      case 'published':
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">PUBLISHED</Badge>;
      default:
        return <Badge variant="secondary">INFO</Badge>;
    }
  };

  const transformValue = useCallback(async (value: string, mapping: FieldMapping): Promise<any> => {
    if (value === null || value === undefined) {
      return null;
    }

    // Handle file fields - skip if it's just a filename
    if (mapping.fieldType === 'file') {
      // If it's just a filename (no actual file upload), skip this field
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
      // Validate and transform select field values
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

  const handleCreateOrUpdateEntry = useCallback(async (
    row: Record<string, string>,
    rowIndex: number
  ): Promise<ImportResult> => {
    try {
      let entryData: Record<string, any> = {};

      // Process each field mapping
      for (const mapping of fieldMapping) {
        if (mapping.contentstackField === 'skip') continue;

        const csvValue = row[mapping.csvColumn];
        if (!csvValue && mapping.isRequired) {
          addLog(`Required field "${mapping.contentstackField}" is missing.`, 'warning', undefined, rowIndex);
          return { rowIndex, success: false, error: `Missing required field: ${mapping.contentstackField}` };
        }

        if (csvValue) {
          const transformedValue = await transformNestedValue(csvValue, mapping.contentstackField, mapping, transformValue);
          
          // Skip null values (like file fields with just filenames)
          if (transformedValue === null) {
            if (mapping.fieldType === 'file') {
              addLog(`Skipping file field "${mapping.contentstackField}" (contains filename: "${csvValue}")`, 'info', undefined, rowIndex);
            } else if (mapping.fieldType === 'select') {
              addLog(`Skipping select field "${mapping.contentstackField}" (invalid option: "${csvValue}")`, 'warning', undefined, rowIndex);
            }
            continue;
          }

          // Special handling for global fields - they need to be wrapped in an object structure
          if (mapping.fieldType === 'global_field') {
            // For global fields, we need to create a nested structure
            const globalFieldData = { [mapping.contentstackField.split('.').pop()!]: transformedValue };
            entryData = mergeNestedData(entryData, globalFieldData, mapping.contentstackField.split('.')[0]);
            addLog(`Global field "${mapping.contentstackField}" structured as nested object`, 'info', JSON.stringify(globalFieldData), rowIndex);
          } else {
            // Merge the transformed value into the entry data
            entryData = mergeNestedData(entryData, transformedValue, mapping.contentstackField);
          }
        }
      }

      // Log the final entry data structure for debugging
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
        setIsPublishing(true);
        try {
          const publishResult = await publishEntry(entryUid);
          setIsPublishing(false);
          addLog(`Entry published successfully`, 'published', publishResult, rowIndex);
          return { rowIndex, success: true, entryUid, published: true, publishResult };
        } catch (publishError: any) {
          setIsPublishing(false);
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

  const startImport = useCallback(async () => {
    setIsImporting(true);
    setResults([]);
    setLogs([]);
    setProgress(0);

    addLog(`Starting import of ${totalRows} rows with ${mappedFieldsCount} mapped fields`, 'info');

    const importResults: ImportResult[] = [];

    for (let i = 0; i < csvData.rows.length; i++) {
      const row = csvData.rows[i];
      addLog(`Processing row ${i + 1}...`, 'info', undefined, i);
      
      const result = await handleCreateOrUpdateEntry(row, i);
      importResults.push(result);

      const currentProgress = ((i + 1) / csvData.rows.length) * 100;
      setProgress(currentProgress);
      setResults([...importResults]);
    }

    const successCount = importResults.filter(r => r.success).length;
    const publishedCount = importResults.filter(r => r.published).length;
    const errorCount = importResults.filter(r => !r.success).length;

    addLog(`Import completed: ${successCount} successful, ${publishedCount} published, ${errorCount} failed`, 
           errorCount > 0 ? 'warning' : 'success');

    setIsImporting(false);
    onImportComplete(importResults);
  }, [csvData, config, fieldMapping, onImportComplete, handleCreateOrUpdateEntry, setIsImporting, totalRows, mappedFieldsCount]);

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

  useEffect(() => {
    if (results.length > 0 && results.every(r => r.success)) {
      const publishedCount = results.filter(r => r.published).length;
      toast({
        title: "Import Completed Successfully! ✅",
        description: `All ${results.length} entries were processed successfully${publishedCount > 0 ? ` and ${publishedCount} were published` : ''}.`,
      });
    } else if (results.length > 0 && results.some(r => !r.success)) {
      const successCount = results.filter(r => r.success).length;
      const errorCount = results.filter(r => !r.success).length;
      toast({
        title: "Import Completed with Issues ⚠️",
        description: `${successCount} entries succeeded, ${errorCount} failed. Check the logs for details.`,
        variant: "destructive",
      });
    }
  }, [results]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Import Progress</h2>
        <div className="flex space-x-2">
          <Button
            variant="secondary"
            onClick={() => setLogs([])}
            disabled={logs.length === 0}
          >
            Clear Logs
          </Button>
          <Button
            disabled={isImporting || isPublishing}
            onClick={startImport}
          >
            {isImporting ? 'Importing...' : isPublishing ? 'Publishing...' : 'Start Import'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Progress value={progress} className="h-3" />
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>
            {isImporting
              ? `Importing data... ${Math.round(progress)}%`
              : isPublishing
              ? 'Publishing entries...'
              : 'Ready to import data.'}
          </span>
          <span>
            Total CSV rows: {totalRows} | Mapped fields: {mappedFieldsCount}
          </span>
        </div>
      </div>

      {/* Summary Statistics - moved to top */}
      <div className="bg-gray-50 p-4 rounded-lg border">
        <div className="flex justify-center space-x-6 text-sm">
          <span className="flex items-center">
            <CheckCircle className="h-4 w-4 text-green-600 mr-2" /> 
            Success: {filteredLogs.filter(l => l.type === 'success').length}
          </span>
          <span className="flex items-center">
            <Globe className="h-4 w-4 text-blue-600 mr-2" /> 
            Published: {filteredLogs.filter(l => l.type === 'published').length}
          </span>
          <span className="flex items-center">
            <XCircle className="h-4 w-4 text-red-600 mr-2" /> 
            Errors: {filteredLogs.filter(l => l.type === 'error').length}
          </span>
          <span className="flex items-center">
            <AlertTriangle className="h-4 w-4 text-yellow-600 mr-2" /> 
            Warnings: {filteredLogs.filter(l => l.type === 'warning').length}
          </span>
        </div>
      </div>

      <div>
        <Label htmlFor="log-filter">Filter Logs:</Label>
        <Input
          type="text"
          id="log-filter"
          placeholder="Filter by message or data"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className="w-full"
        />
      </div>

      <div className="rounded-md border">
        <Table>
          <TableCaption>Import Logs - {filteredLogs.length} entries</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[80px]">Row</TableHead>
              <TableHead className="w-[100px]">Time</TableHead>
              <TableHead className="w-[100px]">Status</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[150px]">Details</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map((log, index) => (
              <TableRow key={index} className={log.type === 'error' ? 'bg-red-50' : log.type === 'success' ? 'bg-green-50' : log.type === 'published' ? 'bg-blue-50' : log.type === 'warning' ? 'bg-yellow-50' : ''}>
                <TableCell className="font-medium">
                  {log.rowIndex !== undefined ? log.rowIndex + 1 : '-'}
                </TableCell>
                <TableCell className="text-xs">{log.timestamp}</TableCell>
                <TableCell>
                  <div className="flex items-center space-x-1">
                    {getLogIcon(log.type)}
                    {getLogBadge(log.type)}
                  </div>
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="truncate" title={log.message}>
                    {log.message}
                  </div>
                </TableCell>
                <TableCell>
                  {log.data && (
                    <Textarea
                      value={log.data}
                      readOnly
                      className="w-full h-20 resize-none text-xs bg-gray-50"
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default ImportProgress;
