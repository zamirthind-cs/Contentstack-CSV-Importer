import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ContentstackConfig, CsvData, FieldMapping, ImportResult } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';
import LogsViewer from './LogsViewer';
import { AlertCircle, CheckCircle, Play, Square, RefreshCw } from 'lucide-react';

interface ImportProgressProps {
  csvData: CsvData;
  config: ContentstackConfig;
  fieldMapping: FieldMapping[];
  onImportComplete: (results: ImportResult[]) => void;
  isImporting: boolean;
  setIsImporting: (importing: boolean) => void;
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
  const [currentEntry, setCurrentEntry] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [logs, setLogs] = useState<string[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const { toast } = useToast();

  const addLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    setLogs(prev => [...prev, logMessage]);
    console.log(logMessage);
  };

  const transformCsvRowToEntry = (row: Record<string, string>, mapping: FieldMapping[]) => {
    const entry: any = {};
    
    addLog(`Transforming CSV row: ${JSON.stringify(row)}`);
    
    mapping.forEach(map => {
      const csvValue = row[map.csvColumn];
      
      if (!csvValue || csvValue.trim() === '') {
        addLog(`Skipping empty field: ${map.csvColumn}`);
        return;
      }

      // Skip file fields that only contain filenames (we can't upload files from CSV)
      if (map.fieldType === 'file') {
        addLog(`Skipping file field: ${map.csvColumn} (file uploads not supported from CSV)`);
        return;
      }

      addLog(`Processing field: ${map.csvColumn} -> ${map.contentstackField} (${map.fieldType})`);
      
      let transformedValue = csvValue;

      try {
        switch (map.fieldType) {
          case 'number':
            transformedValue = parseFloat(csvValue);
            if (isNaN(transformedValue)) {
              addLog(`Warning: Invalid number value "${csvValue}" for field ${map.csvColumn}, skipping`);
              return;
            }
            break;
          case 'boolean':
            transformedValue = csvValue.toLowerCase() === 'true' || csvValue === '1';
            break;
          case 'date':
            const date = new Date(csvValue);
            if (isNaN(date.getTime())) {
              addLog(`Warning: Invalid date value "${csvValue}" for field ${map.csvColumn}, skipping`);
              return;
            }
            transformedValue = date.toISOString();
            break;
          case 'json':
            try {
              transformedValue = JSON.parse(csvValue);
            } catch (e) {
              addLog(`Warning: Invalid JSON value "${csvValue}" for field ${map.csvColumn}, treating as string`);
              transformedValue = csvValue;
            }
            break;
          case 'reference':
            // For reference fields, we expect the UID of the referenced entry
            transformedValue = [{ uid: csvValue }];
            break;
          default:
            // Keep as string for text, link, etc.
            transformedValue = csvValue;
        }

        // Set the field value using the correct field path
        const fieldPath = map.contentstackField;
        if (fieldPath.includes('.')) {
          // Handle nested fields
          const parts = fieldPath.split('.');
          let current = entry;
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
              current[parts[i]] = {};
            }
            current = current[parts[i]];
          }
          current[parts[parts.length - 1]] = transformedValue;
        } else {
          entry[fieldPath] = transformedValue;
        }

        addLog(`Successfully set ${fieldPath} = ${JSON.stringify(transformedValue)}`);
      } catch (error) {
        addLog(`Error processing field ${map.csvColumn}: ${error}`);
      }
    });

    addLog(`Final entry structure: ${JSON.stringify(entry, null, 2)}`);
    return entry;
  };

  const createEntry = async (entryData: any, rowIndex: number): Promise<ImportResult> => {
    try {
      addLog(`Creating entry ${rowIndex + 1}/${csvData.rows.length}`);
      addLog(`Entry data: ${JSON.stringify(entryData, null, 2)}`);

      const response = await fetch(`${config.host}/v3/content_types/${config.contentType}/entries`, {
        method: 'POST',
        headers: {
          'api_key': config.apiKey,
          'authorization': config.managementToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          entry: entryData
        })
      });

      const responseData = await response.json();
      addLog(`API Response (${response.status}): ${JSON.stringify(responseData, null, 2)}`);

      if (!response.ok) {
        const errorMessage = responseData.error_message || responseData.message || `HTTP ${response.status}`;
        addLog(`Entry creation failed: ${errorMessage}`);
        return {
          success: false,
          rowIndex,
          error: errorMessage,
          entryUid: null
        };
      }

      const entryUid = responseData.entry.uid;
      addLog(`Entry created successfully with UID: ${entryUid}`);

      // Publish if configured
      if (config.shouldPublish) {
        try {
          addLog(`Publishing entry ${entryUid}...`);
          const publishResponse = await fetch(`${config.host}/v3/content_types/${config.contentType}/entries/${entryUid}/publish`, {
            method: 'POST',
            headers: {
              'api_key': config.apiKey,
              'authorization': config.managementToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              entry: {
                environments: [config.environment],
                locales: ['en-us']
              }
            })
          });

          if (publishResponse.ok) {
            addLog(`Entry ${entryUid} published successfully`);
          } else {
            const publishError = await publishResponse.json();
            addLog(`Failed to publish entry ${entryUid}: ${publishError.error_message || publishError.message}`);
          }
        } catch (publishError) {
          addLog(`Error publishing entry ${entryUid}: ${publishError}`);
        }
      }

      return {
        success: true,
        rowIndex,
        entryUid,
        error: null
      };

    } catch (error) {
      addLog(`Network error creating entry: ${error}`);
      return {
        success: false,
        rowIndex,
        error: `Network error: ${error}`,
        entryUid: null
      };
    }
  };

  const startImport = async () => {
    if (isImporting) return;

    setIsImporting(true);
    setProgress(0);
    setCurrentEntry(0);
    setResults([]);
    setLogs([]);
    
    addLog('Starting import process...');
    addLog(`Importing ${csvData.rows.length} entries`);
    addLog(`Field mapping: ${JSON.stringify(fieldMapping, null, 2)}`);

    const importResults: ImportResult[] = [];

    for (let i = 0; i < csvData.rows.length; i++) {
      setCurrentEntry(i + 1);
      
      try {
        const row = csvData.rows[i];
        addLog(`\n--- Processing row ${i + 1} ---`);
        
        const entryData = transformCsvRowToEntry(row, fieldMapping);
        
        // Check if we have any actual data to import
        if (Object.keys(entryData).length === 0) {
          addLog(`Skipping row ${i + 1}: No valid data after transformation`);
          importResults.push({
            success: false,
            rowIndex: i,
            error: 'No valid data after transformation (all fields skipped)',
            entryUid: null
          });
        } else {
          const result = await createEntry(entryData, i);
          importResults.push(result);
        }
        
        setProgress(((i + 1) / csvData.rows.length) * 100);
        
        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
        
      } catch (error) {
        addLog(`Error processing row ${i + 1}: ${error}`);
        importResults.push({
          success: false,
          rowIndex: i,
          error: `Processing error: ${error}`,
          entryUid: null
        });
      }
    }

    setResults(importResults);
    setIsImporting(false);
    onImportComplete(importResults);

    const successCount = importResults.filter(r => r.success).length;
    const failureCount = importResults.length - successCount;
    
    addLog(`\nImport completed: ${successCount} successful, ${failureCount} failed`);
    
    toast({
      title: "Import Complete",
      description: `Successfully imported ${successCount} out of ${importResults.length} entries`,
      variant: successCount === importResults.length ? "default" : "destructive"
    });
  };

  const stopImport = () => {
    setIsImporting(false);
    addLog('Import stopped by user');
  };

  const resetImport = () => {
    setProgress(0);
    setCurrentEntry(0);
    setResults([]);
    setLogs([]);
    setIsImporting(false);
  };

  const successfulImports = results.filter(r => r.success).length;
  const failedImports = results.length - successfulImports;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
            4
          </div>
          Import Progress
        </CardTitle>
        <CardDescription>
          Monitor the import progress and view detailed logs
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Import Controls */}
        <div className="flex gap-4">
          <Button 
            onClick={startImport} 
            disabled={isImporting}
            className="bg-green-600 hover:bg-green-700"
          >
            <Play className="w-4 h-4 mr-2" />
            {isImporting ? 'Importing...' : 'Start Import'}
          </Button>
          
          {isImporting && (
            <Button 
              onClick={stopImport} 
              variant="destructive"
            >
              <Square className="w-4 h-4 mr-2" />
              Stop Import
            </Button>
          )}
          
          <Button 
            onClick={resetImport} 
            variant="outline"
            disabled={isImporting}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reset
          </Button>
        </div>

        {/* Progress */}
        {isImporting && (
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm text-gray-600 mb-2">
                <span>Processing entry {currentEntry} of {csvData.rows.length}</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          </div>
        )}

        {/* Results Summary */}
        {results.length > 0 && (
          <div className="grid grid-cols-2 gap-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="text-green-600 font-semibold">Successful: {successfulImports}</span>
            </div>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600" />
              <span className="text-red-600 font-semibold">Failed: {failedImports}</span>
            </div>
          </div>
        )}

        {/* Error Summary */}
        {failedImports > 0 && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>
              {failedImports} entries failed to import. Check the logs below for details.
            </AlertDescription>
          </Alert>
        )}

        {/* Logs */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Import Logs</h3>
            <Button 
              onClick={() => setShowLogs(!showLogs)} 
              variant="outline" 
              size="sm"
            >
              {showLogs ? 'Hide Logs' : 'Show Logs'}
            </Button>
          </div>
          
          {showLogs && (
            <LogsViewer logs={logs} />
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ImportProgress;
