import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { ContentstackConfig, CsvData, FieldMapping, ImportResult } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';
import { Play, Pause, RotateCcw } from 'lucide-react';
import LogsViewer from './LogsViewer';
import { secureLogger } from '@/utils/secureLogger';

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
  const [currentRow, setCurrentRow] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const { toast } = useToast();

  const addLog = (message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info', rowIndex?: number, details?: any) => {
    const timestamp = new Date().toLocaleTimeString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log('📝', logMessage);
    secureLogger.log(message, level, rowIndex, details);
  };

  const formatFieldValue = (value: any, fieldType: string): any => {
    console.log(`🔄 Formatting field value: "${value}" for type: ${fieldType}`);
    
    if (value === null || value === undefined || value === '') {
      console.log('   Empty value, returning null');
      return null;
    }

    const stringValue = String(value).trim();
    if (stringValue === '') {
      console.log('   Empty string value, returning null');
      return null;
    }

    switch (fieldType) {
      case 'number':
        const numValue = Number(stringValue);
        if (isNaN(numValue)) {
          console.log(`   Invalid number: "${stringValue}", returning 0`);
          return 0;
        }
        console.log(`   Converted to number: ${numValue}`);
        return numValue;

      case 'boolean':
        const boolValue = stringValue.toLowerCase() === 'true' || stringValue === '1';
        console.log(`   Converted to boolean: ${boolValue}`);
        return boolValue;

      case 'date':
        try {
          const dateValue = new Date(stringValue).toISOString();
          console.log(`   Converted to date: ${dateValue}`);
          return dateValue;
        } catch (error) {
          console.log(`   Invalid date: "${stringValue}", returning current date`);
          return new Date().toISOString();
        }

      case 'json':
        try {
          const jsonValue = JSON.parse(stringValue);
          console.log(`   Parsed JSON:`, jsonValue);
          return jsonValue;
        } catch (error) {
          console.log(`   Invalid JSON: "${stringValue}", returning as string`);
          return stringValue;
        }

      case 'reference':
        if (stringValue.includes(',')) {
          const refArray = stringValue.split(',').map(ref => ({ uid: ref.trim() }));
          console.log(`   Converted to reference array:`, refArray);
          return refArray;
        } else {
          const refValue = { uid: stringValue };
          console.log(`   Converted to reference object:`, refValue);
          return refValue;
        }

      case 'file':
        console.log(`   Skipping file field - direct file upload not supported from CSV`);
        return null;

      case 'link':
        try {
          const linkObj = JSON.parse(stringValue);
          if (linkObj.href) {
            console.log(`   Converted to link object:`, linkObj);
            return linkObj;
          }
        } catch (e) {
          // If not JSON, treat as URL
          const linkValue = { href: stringValue, title: stringValue };
          console.log(`   Converted URL to link object:`, linkValue);
          return linkValue;
        }
        return stringValue;

      case 'blocks':
      case 'global_field':
        try {
          const parsedValue = JSON.parse(stringValue);
          console.log(`   Parsed ${fieldType}:`, parsedValue);
          return parsedValue;
        } catch (error) {
          console.log(`   Invalid ${fieldType} JSON: "${stringValue}", skipping`);
          return null;
        }

      case 'text':
      default:
        console.log(`   Keeping as text: "${stringValue}"`);
        return stringValue;
    }
  };

  const processRow = async (rowData: Record<string, string>, rowIndex: number): Promise<ImportResult> => {
    console.log(`\n🔄 Processing row ${rowIndex + 1}:`, rowData);
    addLog(`Processing row ${rowIndex + 1} of ${csvData.rows.length}`, 'info', rowIndex);

    try {
      const entryData: Record<string, any> = {};

      // Process field mappings
      for (const mapping of fieldMapping) {
        const csvValue = rowData[mapping.csvColumn];
        console.log(`📋 Mapping "${mapping.csvColumn}" -> "${mapping.contentstackField}"`);
        console.log(`   CSV value: "${csvValue}"`);
        console.log(`   Field type: ${mapping.fieldType}`);

        if (mapping.contentstackField === '__skip__') {
          console.log('   Skipping this field');
          continue;
        }

        // Skip file fields as they can't be uploaded directly from CSV
        if (mapping.fieldType === 'file') {
          console.log('   Skipping file field - not supported for CSV upload');
          addLog(`Skipping file field "${mapping.contentstackField}" - direct file upload not supported`, 'warning', rowIndex);
          continue;
        }

        const formattedValue = formatFieldValue(csvValue, mapping.fieldType);
        
        if (formattedValue !== null) {
          // Handle nested field paths (e.g., "group.nested_field")
          const fieldPath = mapping.contentstackField.split('.');
          let current = entryData;
          
          for (let i = 0; i < fieldPath.length - 1; i++) {
            if (!current[fieldPath[i]]) {
              current[fieldPath[i]] = {};
            }
            current = current[fieldPath[i]];
          }
          
          current[fieldPath[fieldPath.length - 1]] = formattedValue;
          console.log(`   Set field "${mapping.contentstackField}" = ${JSON.stringify(formattedValue)}`);
        } else {
          console.log(`   Skipped field "${mapping.contentstackField}" due to null/empty value`);
        }
      }

      console.log('📦 Final entry data:', JSON.stringify(entryData, null, 2));
      addLog(`Entry data prepared with ${Object.keys(entryData).length} fields`, 'info', rowIndex, entryData);

      // Create entry in Contentstack
      const response = await fetch(`${config.host}/v3/content_types/${config.contentType}/entries`, {
        method: 'POST',
        headers: {
          'api_key': config.apiKey,
          'authorization': config.managementToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          entry: entryData,
        }),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error('❌ Contentstack API error:', responseData);
        addLog(`Error creating entry: ${JSON.stringify(responseData)}`, 'error', rowIndex, responseData);
        throw new Error(responseData.error_message || 'Failed to create entry');
      }

      console.log('✅ Entry created successfully:', responseData.entry.uid);
      addLog(`Entry created successfully with UID: ${responseData.entry.uid}`, 'success', rowIndex);

      let publishResult = null;
      
      // Publish if required
      if (config.shouldPublish) {
        console.log('📤 Publishing entry...');
        addLog(`Publishing entry ${responseData.entry.uid}`, 'info', rowIndex);
        
        const publishResponse = await fetch(
          `${config.host}/v3/content_types/${config.contentType}/entries/${responseData.entry.uid}/publish`,
          {
            method: 'POST',
            headers: {
              'api_key': config.apiKey,
              'authorization': config.managementToken,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              entry: {
                environments: [config.environment],
                locales: ['en-us']
              },
            }),
          }
        );

        const publishData = await publishResponse.json();
        
        if (publishResponse.ok) {
          console.log('✅ Entry published successfully');
          addLog(`Entry published successfully to ${config.environment}`, 'success', rowIndex);
          publishResult = publishData;
        } else {
          console.error('❌ Publish error:', publishData);
          addLog(`Warning: Failed to publish entry - ${JSON.stringify(publishData)}`, 'warning', rowIndex, publishData);
        }
      }

      return {
        success: true,
        rowIndex: rowIndex + 1,
        entryUid: responseData.entry.uid,
        publishResult,
        error: undefined,
      };

    } catch (error) {
      console.error('❌ Row processing error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addLog(`Failed to process row ${rowIndex + 1}: ${errorMessage}`, 'error', rowIndex, error);
      
      return {
        success: false,
        rowIndex: rowIndex + 1,
        entryUid: undefined,
        publishResult: null,
        error: errorMessage,
      };
    }
  };

  const startImport = async () => {
    console.log('🚀 Starting import process...');
    addLog('Starting import process...');
    setIsImporting(true);
    setIsPaused(false);
    setProgress(0);
    setCurrentRow(0);
    setResults([]);

    const totalRows = csvData.rows.length;
    console.log(`📊 Total rows to process: ${totalRows}`);
    addLog(`Total rows to process: ${totalRows}`);

    const importResults: ImportResult[] = [];

    for (let i = 0; i < totalRows && !isPaused; i++) {
      try {
        setCurrentRow(i + 1);
        const result = await processRow(csvData.rows[i], i);
        importResults.push(result);
        setResults([...importResults]);

        const progressPercent = ((i + 1) / totalRows) * 100;
        setProgress(progressPercent);

        // Small delay to prevent overwhelming the API
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error('❌ Unexpected error during import:', error);
        addLog(`Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        break;
      }
    }

    if (!isPaused) {
      setIsImporting(false);
      const successCount = importResults.filter(r => r.success).length;
      const failureCount = importResults.filter(r => !r.success).length;
      
      console.log(`✅ Import completed: ${successCount} success, ${failureCount} failures`);
      addLog(`Import completed: ${successCount} entries created successfully, ${failureCount} failures`);
      
      toast({
        title: "Import Complete",
        description: `${successCount} entries created successfully, ${failureCount} failures`,
        variant: successCount > 0 ? "default" : "destructive"
      });

      onImportComplete(importResults);
    }
  };

  const pauseImport = () => {
    setIsPaused(true);
    setIsImporting(false);
    addLog('Import paused by user');
    toast({
      title: "Import Paused",
      description: "You can resume the import at any time"
    });
  };

  const resetImport = () => {
    setIsImporting(false);
    setIsPaused(false);
    setProgress(0);
    setCurrentRow(0);
    setResults([]);
    setLogs([]);
    toast({
      title: "Import Reset",
      description: "Import progress has been reset"
    });
  };

  return (
    <div className="space-y-6">
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
          <div className="flex gap-3">
            {!isImporting && !isPaused && (
              <Button onClick={startImport} className="bg-green-600 hover:bg-green-700 flex items-center gap-2">
                <Play className="w-4 h-4" />
                Start Import
              </Button>
            )}
            {isImporting && (
              <Button onClick={pauseImport} variant="outline" className="flex items-center gap-2">
                <Pause className="w-4 h-4" />
                Pause Import
              </Button>
            )}
            {isPaused && (
              <Button onClick={startImport} className="bg-green-600 hover:bg-green-700 flex items-center gap-2">
                <Play className="w-4 h-4" />
                Resume Import
              </Button>
            )}
            <Button onClick={resetImport} variant="outline" className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4" />
              Reset
            </Button>
          </div>

          {(isImporting || isPaused || progress > 0) && (
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-2">
                  <span>Progress: {currentRow} / {csvData.rows.length}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>

              {results.length > 0 && (
                <div className="text-sm text-gray-600">
                  <span className="text-green-600">
                    ✓ {results.filter(r => r.success).length} successful
                  </span>
                  {results.filter(r => !r.success).length > 0 && (
                    <span className="text-red-600 ml-4">
                      ✗ {results.filter(r => !r.success).length} failed
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <LogsViewer />
    </div>
  );
};

export default ImportProgress;
