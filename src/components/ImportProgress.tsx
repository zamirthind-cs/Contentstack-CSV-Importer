import React, { useState, useEffect, useCallback } from 'react';
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/use-toast";
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
  type: 'info' | 'warning' | 'error' | 'success';
  data?: string;
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

  const transformValue = useCallback(async (value: string, mapping: FieldMapping): Promise<any> => {
    if (value === null || value === undefined) {
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

      for (const mapping of fieldMapping) {
        if (mapping.contentstackField === 'skip') continue;

        const csvValue = row[mapping.csvColumn];
        if (!csvValue && mapping.isRequired) {
          addLog(`Row ${rowIndex + 1}: Required field "${mapping.contentstackField}" is missing.`, 'warning');
          return { rowIndex, success: false, error: `Missing required field: ${mapping.contentstackField}` };
        }

        if (csvValue) {
          entryData[mapping.contentstackField] = await transformValue(csvValue, mapping);
        }
      }

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
        addLog(`Row ${rowIndex + 1}: Error creating entry: ${errorText}`, 'error', errorText);
        return { rowIndex, success: false, error: errorText };
      }

      const responseData = await response.json();
      const entryUid = responseData.entry.uid;
      addLog(`Row ${rowIndex + 1}: Entry created successfully with UID: ${entryUid}`, 'success');

      if (config.shouldPublish) {
        setIsPublishing(true);
        try {
          const publishResult = await publishEntry(entryUid);
          setIsPublishing(false);
          addLog(`Row ${rowIndex + 1}: Entry published successfully`, 'success', publishResult);
          return { rowIndex, success: true, entryUid, published: true, publishResult };
        } catch (publishError: any) {
          setIsPublishing(false);
          addLog(`Row ${rowIndex + 1}: Error publishing entry: ${publishError.message || publishError}`, 'error', publishError);
          return { rowIndex, success: true, entryUid, published: false, error: publishError.message || publishError };
        }
      }

      return { rowIndex, success: true, entryUid };
    } catch (error: any) {
      addLog(`Row ${rowIndex + 1}: Unexpected error: ${error.message || error}`, 'error', error);
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

    const importResults: ImportResult[] = [];

    for (let i = 0; i < csvData.rows.length; i++) {
      const row = csvData.rows[i];
      const result = await handleCreateOrUpdateEntry(row, i);
      importResults.push(result);

      const currentProgress = ((i + 1) / csvData.rows.length) * 100;
      setProgress(currentProgress);
      setResults(importResults);
    }

    setIsImporting(false);
    onImportComplete(importResults);
  }, [csvData, config, fieldMapping, onImportComplete, handleCreateOrUpdateEntry, setIsImporting]);

  const addLog = (message: string, type: 'info' | 'warning' | 'error' | 'success' = 'info', data?: any) => {
    const logEntry = {
      timestamp: new Date().toISOString(),
      message,
      type,
      data: data ? JSON.stringify(data, null, 2) : undefined
    };
    setLogs(prev => [...prev, logEntry]);
  };

  useEffect(() => {
    if (results.length > 0 && results.every(r => r.success)) {
      toast({
        title: "Import Completed",
        description: "All entries were processed successfully.",
      });
    } else if (results.length > 0 && results.some(r => !r.success)) {
      toast({
        title: "Import Completed with Errors",
        description: "Some entries failed to import. Check the logs for details.",
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
            {isImporting ? 'Importing...' : 'Start Import'}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        <Progress value={progress} />
        <p className="text-sm text-muted-foreground">
          {isImporting
            ? `Importing data... ${Math.round(progress)}%`
            : 'Ready to import data.'}
        </p>
        <p className="text-sm text-muted-foreground">
          Total rows: {totalRows}, Mapped fields: {mappedFieldsCount}
        </p>
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
          <TableCaption>Import Logs</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[100px]">Time</TableHead>
              <TableHead>Message</TableHead>
              <TableHead className="w-[120px]">Type</TableHead>
              <TableHead className="w-[150px]">Data</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredLogs.map((log, index) => (
              <TableRow key={index}>
                <TableCell className="font-medium">{log.timestamp}</TableCell>
                <TableCell>{log.message}</TableCell>
                <TableCell>{log.type}</TableCell>
                <TableCell>
                  {log.data && (
                    <Textarea
                      value={log.data}
                      readOnly
                      className="w-full h-24 resize-none"
                    />
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>
                {filteredLogs.length} log entries
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </div>
    </div>
  );
};

export default ImportProgress;
