import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContentstackConfig, CsvData, FieldMapping, ImportResult } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';
import { StopCircle } from 'lucide-react';
import { secureLogger } from '@/utils/secureLogger';
import LogsViewer from '@/components/LogsViewer';
import { transformNestedValue, mergeNestedData } from '@/utils/fieldUtils';

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
  const [orgName, setOrgName] = useState<string>('destination stack');
  const [referenceCache, setReferenceCache] = useState<Map<string, string>>(new Map());
  const { toast } = useToast();

  const getOrganizationName = async (): Promise<string> => {
    try {
      const response = await fetch(`${config.host}/v3/user`, {
        headers: {
          'api_key': config.apiKey,
          'authorization': config.managementToken,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const orgName = data.user?.organizations?.[0]?.name || 'destination stack';
        secureLogger.info(`Connected to organization: ${orgName}`);
        return orgName;
      } else {
        secureLogger.warning('Failed to retrieve organization name, using default');
        return 'destination stack';
      }
    } catch (error) {
      secureLogger.warning('Error retrieving organization name', { error: error instanceof Error ? error.message : 'Unknown error' });
      return 'destination stack';
    }
  };

  const resolveReference = async (contentTypeUid: string, titleValue: string): Promise<{ uid: string; _content_type_uid: string } | null> => {
    const cacheKey = `${contentTypeUid}:${titleValue}`;
    
    // Check cache first
    if (referenceCache.has(cacheKey)) {
      const cachedUid = referenceCache.get(cacheKey);
      if (cachedUid === 'NOT_FOUND') {
        return null;
      }
      return {
        uid: cachedUid!,
        _content_type_uid: contentTypeUid
      };
    }

    try {
      secureLogger.info(`Resolving reference: ${contentTypeUid} -> "${titleValue}"`);
      
      const response = await fetch(`${config.host}/v3/content_types/${contentTypeUid}/entries?query={"title":"${titleValue}"}`, {
        headers: {
          'api_key': config.apiKey,
          'authorization': config.managementToken,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        const match = data.entries?.[0];
        
        if (match) {
          // Cache the successful resolution
          setReferenceCache(prev => new Map(prev.set(cacheKey, match.uid)));
          secureLogger.success(`Referenced "${titleValue}" (UID: ${match.uid}) successfully linked to content type "${contentTypeUid}"`);
          return {
            uid: match.uid,
            _content_type_uid: contentTypeUid
          };
        } else {
          // Cache the "not found" result
          setReferenceCache(prev => new Map(prev.set(cacheKey, 'NOT_FOUND')));
          secureLogger.warning(`Warning: Reference value "${titleValue}" not found in content type "${contentTypeUid}". Field left empty.`);
          return null;
        }
      } else {
        const errorData = await response.json();
        secureLogger.error(`Reference resolution failed: ${response.status}`, {
          contentType: contentTypeUid,
          title: titleValue,
          error: errorData
        });
        return null;
      }
    } catch (error) {
      secureLogger.error('Error resolving reference', {
        contentType: contentTypeUid,
        title: titleValue,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      return null;
    }
  };

  const transformValue = async (value: string, fieldMapping: FieldMapping): Promise<any> => {
    if (!value || value.trim() === '') return null;
    
    // Check if this is a link field by data type
    if (fieldMapping.fieldType === 'link') {
      return {
        title: value,
        href: value
      };
    }
    
    switch (fieldMapping.fieldType) {
      case 'number':
        return parseFloat(value);
      case 'boolean':
        return value.toLowerCase() === 'true' || value === '1';
      case 'date':
        return new Date(value).toISOString();
      case 'reference':
        if (fieldMapping.referenceContentType) {
          const resolvedRef = await resolveReference(fieldMapping.referenceContentType, value);
          return resolvedRef ? [resolvedRef] : null;
        }
        return null;
      case 'blocks':
      case 'global_field':
        // For blocks and global fields, we'll handle the structure in the main transform function
        return value;
      default:
        return value;
    }
  };

  const checkEntryExists = async (entryData: any): Promise<{ exists: boolean; uid?: string; entry?: any }> => {
    try {
      const titleField = fieldMapping.find(m => m.contentstackField === 'title');
      const titleValue = titleField ? entryData[titleField.contentstackField] : null;
      
      if (!titleValue) {
        secureLogger.warning('No title field found for entry existence check');
        return { exists: false };
      }

      secureLogger.info(`Checking if entry exists with title: ${titleValue}`);

      const response = await fetch(`${config.host}/v3/content_types/${config.contentType}/entries?query={"title":"${titleValue}"}`, {
        headers: {
          'api_key': config.apiKey,
          'authorization': config.managementToken,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const data = await response.json();
        if (data.entries && data.entries.length > 0) {
          secureLogger.success(`Entry found in ${orgName}: ${data.entries[0].uid}`);
          return { exists: true, uid: data.entries[0].uid, entry: data.entries[0] };
        } else {
          secureLogger.info(`Entry "${titleValue}" not found in ${orgName}`);
          return { exists: false };
        }
      } else {
        const errorData = await response.json();
        if (response.status === 412 && errorData.error_code === 109) {
          secureLogger.error(`API credentials invalid or stack not found: ${errorData.error_message}`);
          throw new Error(`Invalid API credentials or stack not found: ${errorData.error_message}`);
        } else {
          secureLogger.error(`API error checking entry existence: ${response.status}`, {
            status: response.status,
            statusText: response.statusText,
            error: errorData
          });
          throw new Error(`API error: ${response.status} - ${errorData.error_message || response.statusText}`);
        }
      }
    } catch (error) {
      secureLogger.error('Error checking entry existence', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  };

  const hasEmptyFieldsToUpdate = (existingEntry: any, newData: any): { hasUpdates: boolean; fieldsToUpdate: string[] } => {
    const fieldsToUpdate: string[] = [];
    
    for (const [key, value] of Object.entries(newData)) {
      if (value !== null && value !== undefined && value !== '') {
        const existingValue = existingEntry[key];
        // Check if the existing field is empty/null/undefined or if it's an empty array (for references)
        const isEmpty = !existingValue || 
          (Array.isArray(existingValue) && existingValue.length === 0) ||
          (typeof existingValue === 'string' && existingValue.trim() === '');
        
        if (isEmpty) {
          fieldsToUpdate.push(key);
        }
      }
    }
    
    return { hasUpdates: fieldsToUpdate.length > 0, fieldsToUpdate };
  };

  const validateReferenceFields = async (entryData: any, rowIndex: number): Promise<{ hasIssues: boolean; issues: string[] }> => {
    const issues: string[] = [];
    const referenceFields = fieldMapping.filter(m => m.fieldType === 'reference');
    
    for (const refField of referenceFields) {
      const refValue = entryData[refField.contentstackField];
      if (refValue && Array.isArray(refValue) && refValue.length > 0) {
        const refEntry = refValue[0];
        if (!refEntry.uid || refEntry.uid.trim() === '') {
          const issue = `Reference field '${refField.contentstackField}' has empty UID`;
          issues.push(issue);
          secureLogger.warning(issue, { field: refField.contentstackField }, rowIndex);
        }
      } else if (refValue === null) {
        const issue = `Reference field '${refField.contentstackField}' could not be resolved - target entry not found in ${orgName}`;
        issues.push(issue);
        secureLogger.warning(issue, { field: refField.contentstackField }, rowIndex);
      }
    }
    
    return { hasIssues: issues.length > 0, issues };
  };

  const generateUniqueTitle = (rowData: Record<string, string>, rowIndex: number): string => {
    const titleMapping = fieldMapping.find(m => m.contentstackField === 'title');
    
    if (titleMapping && rowData[titleMapping.csvColumn]) {
      // Use the actual title from CSV if available
      return rowData[titleMapping.csvColumn];
    }
    
    // Generate a unique title with timestamp to avoid duplicates
    const timestamp = Date.now();
    const randomSuffix = Math.floor(Math.random() * 1000);
    return `Entry_${rowIndex + 1}_${timestamp}_${randomSuffix}`;
  };

  const createOrUpdateEntry = async (rowData: Record<string, string>, rowIndex: number): Promise<ImportResult> => {
    try {
      if (shouldStop) {
        secureLogger.warning('Import stopped by user', {}, rowIndex);
        return {
          rowIndex,
          success: false,
          error: 'Import stopped by user'
        };
      }

      // Generate a unique title
      const uniqueTitle = generateUniqueTitle(rowData, rowIndex);
      
      // Initialize entry data with the unique title
      let entryData: any = {
        title: uniqueTitle
      };

      // Process each field mapping, including nested field handling
      for (const mapping of fieldMapping) {
        const csvValue = rowData[mapping.csvColumn];
        if (csvValue !== undefined && csvValue !== '') {
          const fieldPath = mapping.contentstackField;
          
          if (fieldPath.includes('.')) {
            // Handle nested fields (blocks or global fields)
            const transformedValue = await transformNestedValue(csvValue, fieldPath, mapping, transformValue);
            if (transformedValue !== null) {
              entryData = mergeNestedData(entryData, transformedValue, fieldPath);
            }
          } else {
            // Handle simple fields
            const transformedValue = await transformValue(csvValue, mapping);
            if (transformedValue !== null) {
              entryData[mapping.contentstackField] = transformedValue;
            }
          }
        }
      }

      secureLogger.info(`Processing entry: ${entryData.title}`, { entryTitle: entryData.title }, rowIndex);

      // Validate reference fields and provide detailed feedback
      const { hasIssues, issues } = await validateReferenceFields(entryData, rowIndex);

      // Check if entry already exists
      const existsResult = await checkEntryExists(entryData);
      
      if (existsResult.exists && existsResult.entry) {
        const { hasUpdates, fieldsToUpdate } = hasEmptyFieldsToUpdate(existsResult.entry, entryData);
        
        if (!hasUpdates) {
          let message = `Entry "${entryData.title}" exists in ${orgName} – skipped: all fields are already populated or no new data provided`;
          if (hasIssues) {
            message += `. Reference field warnings: ${issues.join(', ')}`;
          }
          secureLogger.info(message, { existingUid: existsResult.uid, fieldsChecked: Object.keys(entryData) }, rowIndex);
          return {
            rowIndex,
            success: true,
            entryUid: existsResult.uid,
            error: message
          };
        }

        // Update existing entry with only the fields that need updating
        const updateData: any = {};
        fieldsToUpdate.forEach(field => {
          updateData[field] = entryData[field];
        });

        secureLogger.info(`Updating existing entry: ${existsResult.uid} in ${orgName}`, { fieldsToUpdate }, rowIndex);
        const updateResponse = await fetch(`${config.host}/v3/content_types/${config.contentType}/entries/${existsResult.uid}`, {
          method: 'PUT',
          headers: {
            'api_key': config.apiKey,
            'authorization': config.managementToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ entry: updateData })
        });

        if (!updateResponse.ok) {
          const errorData = await updateResponse.json();
          const errorMsg = errorData.error_message || 'Failed to update entry';
          secureLogger.error(`Update failed: ${errorMsg}`, { responseStatus: updateResponse.status }, rowIndex);
          throw new Error(errorMsg);
        }

        const updatedEntryResponse = await updateResponse.json();
        const updatedEntry = updatedEntryResponse.entry;

        let published = false;
        if (config.shouldPublish && config.environment) {
          try {
            // Create publish payload with the complete entry data including references
            const publishPayload: any = {
              entry: {
                environments: [config.environment]
              }
            };

            // Add reference data to publish payload if the entry has references
            const referenceFields = fieldMapping.filter(m => m.fieldType === 'reference');
            if (referenceFields.length > 0) {
              publishPayload.entry = {
                ...publishPayload.entry,
                ...Object.fromEntries(
                  referenceFields
                    .filter(field => updatedEntry[field.contentstackField])
                    .map(field => [field.contentstackField, updatedEntry[field.contentstackField]])
                )
              };
            }

            secureLogger.info(`Publishing entry with references: ${existsResult.uid}`, { publishPayload }, rowIndex);

            const publishResponse = await fetch(`${config.host}/v3/content_types/${config.contentType}/entries/${existsResult.uid}/publish`, {
              method: 'POST',
              headers: {
                'api_key': config.apiKey,
                'authorization': config.managementToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(publishPayload)
            });

            if (publishResponse.ok) {
              published = true;
              secureLogger.success(`Entry published successfully in ${orgName}`, {}, rowIndex);
            } else {
              const publishError = await publishResponse.json();
              secureLogger.warning(`Publish failed but entry was updated in ${orgName}: ${publishError.error_message || 'Unknown publish error'}`, { publishStatus: publishResponse.status, publishError }, rowIndex);
            }
          } catch (publishError) {
            secureLogger.warning(`Failed to publish updated entry in ${orgName}`, { error: publishError instanceof Error ? publishError.message : 'Unknown error' }, rowIndex);
          }
        }

        let message = `Entry "${entryData.title}" updated${published ? ' and published' : ''} in ${orgName} – ${fieldsToUpdate.length} fields populated`;
        if (hasIssues) {
          message += `. Reference field warnings: ${issues.join(', ')}`;
        }

        secureLogger.success(message, { updatedUid: existsResult.uid, published, fieldsUpdated: fieldsToUpdate }, rowIndex);
        return {
          rowIndex,
          success: true,
          entryUid: existsResult.uid,
          published,
          error: message
        };
      }

      // Entry doesn't exist - create it
      secureLogger.info(`Entry "${entryData.title}" not found in ${orgName} – creating new entry`);

      const createResponse = await fetch(`${config.host}/v3/content_types/${config.contentType}/entries`, {
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
        const errorMsg = errorData.error_message || 'Failed to create entry';
        secureLogger.error(`Creation failed: ${errorMsg}`, { responseStatus: createResponse.status }, rowIndex);
        throw new Error(errorMsg);
      }

      const createdEntryResponse = await createResponse.json();
      const createdEntry = createdEntryResponse.entry;

      let published = false;
      if (config.shouldPublish && config.environment) {
        try {
          // Create publish payload with the complete entry data including references
          const publishPayload: any = {
            entry: {
              environments: [config.environment]
            }
          };

          // Add reference data to publish payload if the entry has references
          const referenceFields = fieldMapping.filter(m => m.fieldType === 'reference');
          if (referenceFields.length > 0) {
            publishPayload.entry = {
              ...publishPayload.entry,
              ...Object.fromEntries(
                referenceFields
                  .filter(field => createdEntry[field.contentstackField])
                  .map(field => [field.contentstackField, createdEntry[field.contentstackField]])
              )
            };
          }

          secureLogger.info(`Publishing created entry with references: ${createdEntry.uid}`, { publishPayload }, rowIndex);

          const publishResponse = await fetch(`${config.host}/v3/content_types/${config.contentType}/entries/${createdEntry.uid}/publish`, {
            method: 'POST',
            headers: {
              'api_key': config.apiKey,
              'authorization': config.managementToken,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(publishPayload)
          });

          if (publishResponse.ok) {
            published = true;
            secureLogger.success(`Entry published successfully in ${orgName}`, {}, rowIndex);
          } else {
            const publishError = await publishResponse.json();
            secureLogger.warning(`Publish failed but entry was created in ${orgName}: ${publishError.error_message || 'Unknown publish error'}`, { publishStatus: publishResponse.status, publishError }, rowIndex);
          }
        } catch (publishError) {
          secureLogger.warning(`Failed to publish created entry in ${orgName}`, { error: publishError instanceof Error ? publishError.message : 'Unknown error' }, rowIndex);
        }
      }

      let message = `Entry "${entryData.title}" created${published ? ' and published' : ''} in ${orgName}`;
      if (hasIssues) {
        message += `. Reference field warnings: ${issues.join(', ')}`;
      }

      secureLogger.success(message, { createdUid: createdEntry.uid, published }, rowIndex);
      return {
        rowIndex,
        success: true,
        entryUid: createdEntry.uid,
        published,
        error: message
      };

    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      secureLogger.error(`Processing failed: ${errorMsg}`, { error: errorMsg }, rowIndex);
      return {
        rowIndex,
        success: false,
        error: errorMsg
      };
    }
  };

  const startImport = async () => {
    setIsImporting(true);
    setProgress(0);
    setCurrentRow(0);
    setResults([]);
    setShouldStop(false);
    setReferenceCache(new Map()); // Clear reference cache

    secureLogger.clearLogs();
    
    // Get organization name first
    const retrievedOrgName = await getOrganizationName();
    setOrgName(retrievedOrgName);
    
    secureLogger.info(`Starting import process for ${csvData.rows.length} rows to ${retrievedOrgName}`);

    const importResults: ImportResult[] = [];
    const totalRows = csvData.rows.length;

    for (let i = 0; i < totalRows; i++) {
      if (shouldStop) {
        secureLogger.warning(`Import stopped by user at row ${i + 1}/${totalRows}`);
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

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const successCount = importResults.filter(r => r.success).length;
    const publishedCount = importResults.filter(r => r.published).length;
    const updatedCount = importResults.filter(r => r.success && r.error?.includes('updated')).length;
    const createdCount = importResults.filter(r => r.success && r.error?.includes('created')).length;
    const skippedCount = importResults.filter(r => r.success && (r.error?.includes('skipped') || r.error?.includes('no new fields'))).length;

    secureLogger.success(`Import completed to ${retrievedOrgName}: ${importResults.length}/${totalRows} processed, ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped, ${publishedCount} published`);

    toast({
      title: "Import Complete",
      description: `Processed ${importResults.length}/${totalRows} entries. ${createdCount} created, ${updatedCount} updated, ${skippedCount} skipped, ${publishedCount} published.`
    });

    setIsImporting(false);
    onImportComplete(importResults);
  };

  const stopImport = () => {
    setShouldStop(true);
    secureLogger.warning('Stop import requested by user');
    toast({
      title: "Stopping Import",
      description: "Import will stop after current entry is processed"
    });
  };

  const successCount = results.filter(r => r.success).length;
  const errorCount = results.filter(r => !r.success).length;
  const publishedCount = results.filter(r => r.published).length;
  const updatedCount = results.filter(r => r.success && r.error?.includes('updated')).length;
  const createdCount = results.filter(r => r.success && r.error?.includes('created')).length;
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
          Execute the import process and monitor progress (supports nested fields from modular blocks and global fields)
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="import" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="import">Import</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
          
          <TabsContent value="import" className="space-y-6">
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
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
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
                  <Badge variant="default" className="bg-purple-600">
                    {createdCount} Created
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
          </TabsContent>
          
          <TabsContent value="logs">
            <LogsViewer />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ImportProgress;
