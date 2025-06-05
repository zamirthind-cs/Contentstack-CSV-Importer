
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ContentstackConfig, CsvData, FieldMapping, ImportResult } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';

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
  const { toast } = useToast();

  const transformValue = (value: string, fieldType: FieldMapping['fieldType']): any => {
    if (!value || value.trim() === '') return null;
    
    switch (fieldType) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value.toLowerCase() === 'true' || value === '1';
      case 'date':
        return new Date(value).toISOString();
      case 'reference':
        // For reference fields, assume the CSV contains UIDs
        return [{ uid: value }];
      default:
        return value;
    }
  };

  const createEntry = async (rowData: Record<string, string>, rowIndex: number): Promise<ImportResult> => {
    try {
      // Transform row data according to field mapping
      const entryData: any = {
        title: rowData[fieldMapping.find(m => m.contentstackField === 'title')?.csvColumn || ''] || `Entry ${rowIndex + 1}`
      };

      fieldMapping.forEach(mapping => {
        const csvValue = rowData[mapping.csvColumn];
        if (csvValue !== undefined && csvValue !== '') {
          entryData[mapping.contentstackField] = transformValue(csvValue, mapping.fieldType);
        }
      });

      console.log('Creating entry:', entryData);

      // Create entry
      const createResponse = await fetch(`https://${config.host}/v3/content_types/${config.contentType}/entries`, {
        method: 'POST',
        headers: {
          'api_key': config.apiKey,
          'authorization': config.managementToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ entry: entryData })
      });

      if (!createResponse.ok) {
        const errorData = await createResponse.json();
        throw new Error(errorData.error_message || 'Failed to create entry');
      }

      const createResult = await createResponse.json();
      const entryUid = createResult.entry.uid;

      let published = false;

      // Publish entry if requested
      if (config.shouldPublish && config.environment) {
        try {
          const publishResponse = await fetch(`https://${config.host}/v3/content_types/${config.contentType}/entries/${entryUid}/publish`, {
            method: 'POST',
            headers: {
              'api_key': config.apiKey,
              'authorization': config.managementToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              entry: {
                environments: [config.environment]
              }
            })
          });

          if (publishResponse.ok) {
            published = true;
          }
        } catch (publishError) {
          console.warn('Failed to publish entry:', publishError);
        }
      }

      return {
        rowIndex,
        success: true,
        entryUid,
        published
      };
    } catch (error) {
      console.error('Error creating entry:', error);
      return {
        rowIndex,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  const startImport = async () => {
    setIsImporting(true);
    setProgress(0);
    setCurrentRow(0);
    setResults([]);

    const importResults: ImportResult[] = [];
    const totalRows = csvData.rows.length;

    for (let i = 0; i < totalRows; i++) {
      setCurrentRow(i + 1);
      const result = await createEntry(csvData.rows[i], i);
      importResults.push(result);
      setResults([...importResults]);
      
      const progressPercentage = ((i + 1) / totalRows) * 100;
      setProgress(progressPercentage);

      // Small delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = importResults.filter(r => r.success).length;
    const publishedCount = importResults.filter(r => r.published).length;

    toast({
      title: "Import Complete",
      description: `Successfully imported ${successCount}/${totalRows} entries. ${publishedCount} published.`
    });

    onImportComplete(importResults);
  };

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const publishedCount = results.filter(r => r.published).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
            4
          </div>
          Import Data
        </CardTitle>
        <CardDescription>
          Execute the import process and monitor progress
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          {/* Import Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">{csvData.rows.length}</div>
                <div className="text-sm text-gray-600">Total Rows</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-green-600">{fieldMapping.length}</div>
                <div className="text-sm text-gray-600">Mapped Fields</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-purple-600">
                  {config.shouldPublish ? 'Yes' : 'No'}
                </div>
                <div className="text-sm text-gray-600">Auto Publish</div>
              </CardContent>
            </Card>
          </div>

          {/* Progress */}
          {isImporting && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Processing row {currentRow} of {csvData.rows.length}</span>
                  <span>{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="w-full" />
              </div>
            </div>
          )}

          {/* Results Summary */}
          {results.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <Badge variant="default" className="bg-green-600">
                  {successCount} Success
                </Badge>
              </div>
              <div className="text-center">
                <Badge variant="destructive">
                  {errorCount} Errors
                </Badge>
              </div>
              <div className="text-center">
                <Badge variant="secondary">
                  {publishedCount} Published
                </Badge>
              </div>
            </div>
          )}

          {/* Results Details */}
          {results.length > 0 && (
            <div className="max-h-60 overflow-y-auto border rounded-lg">
              <div className="p-4 space-y-2">
                {results.map((result, index) => (
                  <div key={index} className={`flex justify-between items-center p-2 rounded ${
                    result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  } border`}>
                    <span className="text-sm">Row {result.rowIndex + 1}</span>
                    <div className="flex items-center gap-2">
                      {result.success ? (
                        <>
                          <Badge variant="default" className="bg-green-600 text-xs">Success</Badge>
                          {result.published && (
                            <Badge variant="secondary" className="text-xs">Published</Badge>
                          )}
                          {result.entryUid && (
                            <span className="text-xs text-gray-500">{result.entryUid}</span>
                          )}
                        </>
                      ) : (
                        <>
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                          <span className="text-xs text-red-600">{result.error}</span>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isImporting && results.length === 0 && (
            <Button onClick={startImport} className="w-full bg-blue-600 hover:bg-blue-700">
              Start Import Process
            </Button>
          )}

          {isImporting && (
            <Button disabled className="w-full">
              Importing... Please wait
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ImportProgress;
