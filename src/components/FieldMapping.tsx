
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ContentstackConfig, FieldMapping as FieldMappingType, FlattenedField } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';
import { flattenContentstackFields, flattenContentstackFieldsSync, getFieldType } from '@/utils/fieldUtils';

interface FieldMappingProps {
  csvHeaders: string[];
  config: ContentstackConfig;
  onMappingComplete: (mapping: FieldMappingType[]) => void;
}

const FieldMapping: React.FC<FieldMappingProps> = ({ csvHeaders, config, onMappingComplete }) => {
  const [mapping, setMapping] = useState<FieldMappingType[]>([]);
  const [flattenedFields, setFlattenedFields] = useState<FlattenedField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchWarnings, setFetchWarnings] = useState<string[]>([]);
  const { toast } = useToast();

  useEffect(() => {
    if (config.schema) {
      // Use uploaded schema and flatten it
      initializeFromSchema();
    } else {
      // Fallback to API fetch
      fetchContentstackFields();
    }
  }, []);

  const initializeFromSchema = async () => {
    const warnings: string[] = [];
    try {
      if (config.schema) {
        console.log('Starting async field flattening with uploaded schema...');
        // Use async flattening to handle global fields that need to be fetched
        const flattened = await flattenContentstackFields(config.schema, '', '', {
          apiKey: config.apiKey,
          managementToken: config.managementToken,
          host: config.host
        });
        
        // Check for any global fields that couldn't be fully processed
        const globalFieldsWithIssues = flattened.filter(f => 
          f.data_type === 'global_field' && 
          (f.display_name.includes('invalid credentials') || 
           f.display_name.includes('not found') || 
           f.display_name.includes('unauthorized') ||
           f.display_name.includes('network error') ||
           f.display_name.includes('no config'))
        );
        
        if (globalFieldsWithIssues.length > 0) {
          const issueDetails = globalFieldsWithIssues.map(f => {
            const issue = f.display_name.match(/\(global field - (.+)\)/)?.[1] || 'unknown error';
            return `${f.uid}: ${issue}`;
          });
          warnings.push(`Global field issues: ${issueDetails.join(', ')}`);
        }
        
        console.log(`Field flattening complete. Found ${flattened.length} total fields`);
        setFlattenedFields(flattened);
        setFetchWarnings(warnings);
        initializeMapping(flattened);
      }
    } catch (error) {
      console.warn('Error during async field flattening, falling back to sync:', error);
      warnings.push('Global field fetching failed, using local schema only');
      // Fallback to sync version if async fails
      if (config.schema) {
        const flattened = flattenContentstackFieldsSync(config.schema);
        setFlattenedFields(flattened);
        setFetchWarnings(warnings);
        initializeMapping(flattened);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const initializeMapping = (fields: FlattenedField[]) => {
    const initialMapping = csvHeaders.map(header => {
      // Try to find a matching field by name, display name, or path
      const matchingField = fields.find(field => 
        field.uid.toLowerCase() === header.toLowerCase() ||
        field.display_name.toLowerCase() === header.toLowerCase() ||
        field.fieldPath.toLowerCase() === header.toLowerCase()
      );
      
      return {
        csvColumn: header,
        contentstackField: matchingField ? matchingField.fieldPath : '__skip__',
        fieldType: matchingField ? getFieldType(matchingField.data_type) : 'text' as const,
        isRequired: matchingField ? matchingField.mandatory : false,
        referenceContentType: matchingField?.data_type === 'reference' ? matchingField.reference_to?.[0] : undefined,
        blockType: matchingField?.blockType,
        parentField: matchingField?.parentField
      };
    });
    
    setMapping(initialMapping);
  };

  const fetchContentstackFields = async () => {
    try {
      const response = await fetch(`${config.host}/v3/content_types/${config.contentType}`, {
        headers: {
          'api_key': config.apiKey,
          'authorization': config.managementToken,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch content type schema');
      }

      const data = await response.json();
      const fields = data.content_type.schema || [];
      
      // Use async flattening to handle global fields
      const flattened = await flattenContentstackFields(fields, '', '', {
        apiKey: config.apiKey,
        managementToken: config.managementToken,
        host: config.host
      });
      
      setFlattenedFields(flattened);
      initializeMapping(flattened);
      setIsLoading(false);
    } catch (error) {
      toast({
        title: "Error Fetching Content Type",
        description: "Could not fetch content type schema. Please check your configuration or upload a schema file.",
        variant: "destructive"
      });
      setIsLoading(false);
    }
  };

  const updateMapping = (index: number, field: keyof FieldMappingType, value: any) => {
    const newMapping = [...mapping];
    newMapping[index] = { ...newMapping[index], [field]: value };
    
    // Auto-detect field type and requirements based on Contentstack field
    if (field === 'contentstackField') {
      const csField = flattenedFields.find(f => f.fieldPath === value);
      if (csField) {
        newMapping[index].fieldType = getFieldType(csField.data_type);
        newMapping[index].isRequired = csField.mandatory;
        newMapping[index].blockType = csField.blockType;
        newMapping[index].parentField = csField.parentField;
        if (csField.data_type === 'reference' && csField.reference_to) {
          newMapping[index].referenceContentType = csField.reference_to[0];
        }
      }
    }
    
    setMapping(newMapping);
  };

  const handleSubmit = () => {
    const validMapping = mapping.filter(m => m.contentstackField !== '__skip__');
    
    if (validMapping.length === 0) {
      toast({
        title: "No Fields Mapped",
        description: "Please map at least one CSV column to a Contentstack field",
        variant: "destructive"
      });
      return;
    }

    onMappingComplete(validMapping);
    toast({
      title: "Field Mapping Complete",
      description: `Successfully mapped ${validMapping.length} fields`
    });
  };

  const getFieldDisplayInfo = (field: FlattenedField) => {
    let displayText = field.display_name;
    let typeInfo = field.data_type;
    
    if (field.blockType) {
      typeInfo += ` (block: ${field.blockType})`;
    }
    
    if (field.parentField) {
      typeInfo += ` (nested)`;
    }
    
    return { displayText, typeInfo };
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p>Loading content type schema...</p>
          <p className="text-sm text-gray-500 mt-2">Fetching global field schemas...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
            3
          </div>
          Field Mapping
        </CardTitle>
        <CardDescription>
          Map your CSV columns to Contentstack fields (including nested fields from modular blocks and global fields)
          {config.schema && (
            <span className="block text-green-600 text-sm mt-1">
              ✓ Using uploaded schema with {flattenedFields.length} fields (including nested)
            </span>
          )}
          {fetchWarnings.length > 0 && (
            <div className="mt-2 p-3 bg-amber-50 border border-amber-200 rounded text-sm">
              <div className="font-medium text-amber-800 mb-2">⚠️ Global Field Access Issues:</div>
              {fetchWarnings.map((warning, index) => (
                <div key={index} className="text-xs text-amber-700 mb-1">• {warning}</div>
              ))}
              <div className="text-xs text-amber-700 mt-2 p-2 bg-amber-100 rounded">
                💡 <strong>Tip:</strong> Check your API credentials and ensure the global fields exist and are accessible with your management token.
              </div>
            </div>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid gap-4">
            {csvHeaders.map((header, index) => (
              <div key={header} className="p-4 border rounded-lg bg-gray-50">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div>
                    <Label className="text-sm font-medium">CSV Column</Label>
                    <Input value={header} disabled className="bg-white" />
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Contentstack Field</Label>
                    <Select
                      value={mapping[index]?.contentstackField || '__skip__'}
                      onValueChange={(value) => updateMapping(index, 'contentstackField', value)}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select field" />
                      </SelectTrigger>
                      <SelectContent className="max-h-60 overflow-y-auto">
                        <SelectItem value="__skip__">-- Skip this column --</SelectItem>
                        {flattenedFields.map(field => {
                          const { displayText, typeInfo } = getFieldDisplayInfo(field);
                          return (
                            <SelectItem key={field.fieldPath} value={field.fieldPath}>
                              <div className="flex flex-col">
                                <span>{displayText}</span>
                                <span className="text-xs text-gray-500">
                                  {field.fieldPath} ({typeInfo})
                                  {field.mandatory && <span className="text-red-500"> *</span>}
                                </span>
                              </div>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div>
                    <Label className="text-sm font-medium">Field Type</Label>
                    <Input
                      value={mapping[index]?.fieldType || 'text'}
                      disabled
                      className="bg-gray-100"
                    />
                  </div>
                </div>
                
                {mapping[index]?.fieldType === 'reference' && (
                  <div className="mt-3">
                    <Label className="text-sm font-medium">Reference Content Type</Label>
                    <Input
                      value={mapping[index]?.referenceContentType || ''}
                      onChange={(e) => updateMapping(index, 'referenceContentType', e.target.value)}
                      placeholder="Enter referenced content type UID"
                      className="mt-1"
                    />
                  </div>
                )}
                
                {mapping[index]?.blockType && (
                  <div className="mt-3">
                    <div className="text-sm text-blue-600">
                      ℹ️ This field is part of a modular block: <strong>{mapping[index].blockType}</strong>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          
          <Button onClick={handleSubmit} className="w-full bg-blue-600 hover:bg-blue-700">
            Complete Field Mapping
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default FieldMapping;
