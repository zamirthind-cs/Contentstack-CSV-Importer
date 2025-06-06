import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ContentstackConfig, CsvData, FieldMapping, ImportResult } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';
import { StopCircle } from 'lucide-react';

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
  const [shouldStop, setShouldStop] = useState(false);
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

  const checkEntryExists = async (entryData: any): Promise<string | null> => {
    try {
      // Check if entry exists by title or unique identifier
      const titleField = fieldMapping.find(m => m.contentstackField === 'title');
      const titleValue = titleField ? entryData[titleField.contentstackField] : null;
      
      if (!titleValue) return null;

      const response = await fetch(`https://${config.host}/v3/content_types/${config.contentType}/entries?query={"title":"${titleValue}"}`, {
        headers: {
          'api_key': config.apiKey,
          'authorization': config.managementToken,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.entries && data.entries.length > 0) {
          return data.entries[0].uid;
        }
      }
      
      return null;
    } catch (error) {
      console.warn('Error checking entry existence:', error);
      return null;
    }
  };

  const hasNewFields = (existingEntry: any, newData: any): boolean => {
    // Check if there are any new fields that don't exist in the current entry
    for (const [key, value] of Object.entries(newData)) {
      if (value !== null && value !== undefined && value !== '') {
        if (!existingEntry[key] || existingEntry[key] !== value) {
          return true;
        }
      }
    }
    return false;
  };

  const validateReferenceFields = (entryData: any): { hasIssues: boolean; issues: string[] } => {
    const issues: string[] = [];
    const referenceFields = fieldMapping.filter(m => m.fieldType === 'reference');
    
    referenceFields.forEach(refField => {
      const refValue = entryData[refField.contentstackField];
      if (refValue && Array.isArray(refValue) && refValue.length > 0) {
        const uid = refValue[0].uid;
        if (!uid || uid.trim() === '') {
          issues.push(`Reference field '${refField.contentstackField}' has empty UID`);
        } else {
          // Note: We're not actually checking if the referenced entry exists in Contentstack
          // This would require additional API calls which might be expensive
          issues.push(`Reference field '${refField.contentstackField}' points to '${uid}' (not verified if exists)`);
        }
      }
    });
    
    return { hasIssues: issues.length > 0, issues };
  };

  const createOrUpdateEntry = async (rowData: Record<string, string>, rowIndex: number): Promise<ImportResult> => {
    try {
      if (shouldStop) {
        return {
          rowIndex,
          success: false,
          error: 'Import stopped by user'
        };
      }

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

      console.log('Processing entry:', entryData);

      // Validate reference fields and provide detailed feedback
      const { hasIssues, issues } = validateReferenceFields(entryData);

      // Check if entry already exists
      const existingEntryUid = await checkEntryExists(entryData);
      
      if (existingEntryUid) {
        // Entry exists, check if we need to update it
        try {
          const getResponse = await fetch(`https://${config.host}/v3/content_types/${config.contentType}/entries/${existingEntryUid}`, {
            headers: {
              'api_key': config.apiKey,
              'authorization': config.managementToken,
              'Content-Type': 'application/json'
            }
          });

          if (getResponse.ok) {
            const existingData = await getResponse.json();
            const existingEntry = existingData.entry;

            if (!hasNewFields(existingEntry, entryData)) {
              let message = 'Entry exists with no new fields to update';
              if (hasIssues) {
                message += `. Reference field warnings: ${issues.join(', ')}`;
              }
              return {
                rowIndex,
                success: true,
                entryUid: existingEntryUid,
                error: message
              };
            }

            // Update existing entry
            const updateResponse = await fetch(`https://${config.host}/v3/content_types/${config.contentType}/entries/${existingEntryUid}`, {
              method: 'PUT',
              headers: {
                'api_key': config.apiKey,
                'authorization': config.managementToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ entry: entryData })
            });

            if (!updateResponse.ok) {
              const errorData = await updateResponse.json();
              throw new Error(errorData.error_message || 'Failed to update entry');
            }

            let published = false;
            if (config.shouldPublish && config.environment) {
              try {
                const publishResponse = await fetch(`https://${config.host}/v3/content_types/${config.contentType}/entries/${existingEntryUid}/publish`, {
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
                console.warn('Failed to publish updated entry:', publishError);
              }
            }

            let message = 'Entry updated with new fields';
            if (hasIssues) {
              message += `. Reference field warnings: ${issues.join(', ')}`;
            }

            return {
              rowIndex,
              success: true,
              entryUid: existingEntryUid,
              published,
              error: message
            };
          }
        } catch (error) {
          console.warn('Error fetching existing entry:', error);
        }
      }

      // Entry doesn't exist - provide specific feedback about why we're not creating it
      let message = `Entry with title "${entryData.title}" does not exist in Contentstack - skipped (policy: do not create new entries)`;
      if (hasIssues) {
        message += `. Reference field issues that would have prevented creation: ${issues.join(', ')}`;
      }

      return {
        rowIndex,
        success: true,
        error: message
      };

    } catch (error) {
      console.error('Error processing entry:', error);
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
    setShouldStop(false);

    const importResults: ImportResult[] = [];
    const totalRows = csvData.rows.length;

    for (let i = 0; i < totalRows; i++) {
      if (shouldStop) {
        toast({
          title: "Import Stopped",
          description: `Import stopped by user at row ${i + 1}/${totalRows}`
        });
        break;
      }

      setCurrentRow(i + 1);
      const result = await createOrUpdateEntry(csvData.rows[i], i);
      importResults.push(result);
      setResults([...importResults]);
      
      const progressPercentage = ((i + 1) / totalRows) * 100;
      setProgress(progressPercentage);

      // Small delay to prevent rate limiting
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = importResults.filter(r => r.success).length;
    const publishedCount = importResults.filter(r => r.published).length;
    const updatedCount = importResults.filter(r => r.success && r.error?.includes('updated')).length;
    const skippedCount = importResults.filter(r => r.success && (r.error?.includes('skipped') || r.error?.includes('no new fields'))).length;

    toast({
      title: "Import Complete",
      description: `Processed ${importResults.length}/${totalRows} entries. ${updatedCount} updated, ${skippedCount} skipped, ${publishedCount} published.`
    });

    setIsImporting(false);
    onImportComplete(importResults);
  };

  const stopImport = () => {
    setShouldStop(true);
    toast({
      title: "Stopping Import",
      description: "Import will stop after current entry is processed"
    });
  };

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const publishedCount = results.filter(r => r.published).length;
  const updatedCount = results.filter(r => r.success && r.error?.includes('updated')).length;
  const skippedCount = results.filter(r => r.success && (r.error?.includes('skipped') || r.error?.includes('no new fields'))).length;

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
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <div className="text-center">
                <Badge variant="default" className="bg-blue-600">
                  {updatedCount} Updated
                </Badge>
              </div>
              <div className="text-center">
                <Badge variant="outline">
                  {skippedCount} Skipped
                </Badge>
              </div>
            </div>
          )}

          {/* Results Details */}
          {results.length > 0 && (
            <div className="max-h-60 overflow-y-auto border rounded-lg">
              <div className="p-4 space-y-2">
                {results.map((result, index) => (
                  <div key={index} className={`flex justify-between items-start p-3 rounded ${
                    result.success ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'
                  } border`}>
                    <span className="text-sm font-medium">Row {result.rowIndex + 1}</span>
                    <div className="flex flex-col items-end gap-1 max-w-2xl">
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
                          <Badge variant="destructive" className="text-xs">Error</Badge>
                        )}
                      </div>
                      {result.error && (
                        <span className={`text-xs text-right leading-relaxed ${
                          result.success ? 'text-blue-600' : 'text-red-600'
                        }`}>
                          {result.error}
                        </span>
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
            <div className="flex gap-2">
              <Button disabled className="flex-1">
                Importing... Please wait
              </Button>
              <Button onClick={stopImport} variant="destructive" className="flex items-center gap-2">
                <StopCircle className="w-4 h-4" />
                Stop Import
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ImportProgress;
