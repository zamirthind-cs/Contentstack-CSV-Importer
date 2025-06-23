import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ContentstackConfig, FieldMapping as FieldMappingType, FlattenedField } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';
import { flattenContentstackFields, flattenContentstackFieldsSync } from '@/utils/fieldUtils';
import FieldMappingRow from './FieldMapping/FieldMappingRow';
import GlobalFieldWarnings from './FieldMapping/GlobalFieldWarnings';
import { useMappingInitializer } from './FieldMapping/useMappingInitializer';
import { CheckCircle } from 'lucide-react';

interface FieldMappingProps {
  csvHeaders: string[];
  config: ContentstackConfig;
  onMappingComplete: (mapping: FieldMappingType[]) => void;
  initialMapping?: FieldMappingType[];
}

const FieldMapping: React.FC<FieldMappingProps> = ({ csvHeaders, config, onMappingComplete, initialMapping }) => {
  const [flattenedFields, setFlattenedFields] = useState<FlattenedField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [fetchWarnings, setFetchWarnings] = useState<string[]>([]);
  const [hasMappingData, setHasMappingData] = useState(false);
  const { toast } = useToast();
  const { mapping, initializeMapping, updateMapping, setMappingDirectly } = useMappingInitializer();

  useEffect(() => {
    console.log('FieldMapping useEffect triggered with csvHeaders:', csvHeaders);
    console.log('Config:', config);
    console.log('Initial mapping:', initialMapping);
    
    if (config.schema) {
      initializeFromSchema();
    } else {
      fetchContentstackFields();
    }
  }, []);

  useEffect(() => {
    if (initialMapping && initialMapping.length > 0 && flattenedFields.length > 0) {
      console.log('Restoring field mapping from initial data:', initialMapping);
      setMappingDirectly(initialMapping);
      setHasMappingData(true);
    }
  }, [initialMapping, flattenedFields, setMappingDirectly]);

  const initializeFromSchema = async () => {
    const warnings: string[] = [];
    try {
      if (config.schema) {
        console.log('Starting async field flattening with uploaded schema...');
        console.log('Schema object:', config.schema);
        
        // Extract the schema array from the content type object
        let schemaFields;
        if (Array.isArray(config.schema)) {
          schemaFields = config.schema;
        } else if (config.schema.schema && Array.isArray(config.schema.schema)) {
          schemaFields = config.schema.schema;
        } else {
          throw new Error('Invalid schema format - expected array or object with schema property');
        }
        
        console.log('Extracted schema fields:', schemaFields);
        
        const flattened = await flattenContentstackFields(schemaFields, '', '', {
          apiKey: config.apiKey,
          managementToken: config.managementToken,
          host: config.host
        });
        
        console.log('Flattened fields:', flattened);
        
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
        initializeMapping(flattened, csvHeaders);
      }
    } catch (error) {
      console.warn('Error during async field flattening, falling back to sync:', error);
      warnings.push('Global field fetching failed, using local schema only');
      if (config.schema) {
        let schemaFields;
        if (Array.isArray(config.schema)) {
          schemaFields = config.schema;
        } else if (config.schema.schema && Array.isArray(config.schema.schema)) {
          schemaFields = config.schema.schema;
        } else {
          console.error('Invalid schema format for sync fallback');
          setIsLoading(false);
          return;
        }
        
        const flattened = flattenContentstackFieldsSync(schemaFields);
        console.log('Sync flattened fields:', flattened);
        setFlattenedFields(flattened);
        setFetchWarnings(warnings);
        initializeMapping(flattened, csvHeaders);
      }
    } finally {
      setIsLoading(false);
    }
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
      
      const flattened = await flattenContentstackFields(fields, '', '', {
        apiKey: config.apiKey,
        managementToken: config.managementToken,
        host: config.host
      });
      
      setFlattenedFields(flattened);
      initializeMapping(flattened, csvHeaders);
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

  const handleMappingUpdate = (index: number, field: keyof FieldMappingType, value: any) => {
    updateMapping(index, field, value, flattenedFields);
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
          {hasMappingData && (
            <span className="text-sm text-green-600 font-normal flex items-center gap-1">
              <CheckCircle className="w-4 h-4" />
              Previous mapping restored
            </span>
          )}
        </CardTitle>
        <CardDescription>
          Map your CSV columns to Contentstack fields (including nested fields from modular blocks and global fields)
          {config.schema && (
            <span className="block text-green-600 text-sm mt-1">
              ✓ Using uploaded schema with {flattenedFields.length} fields (including nested)
            </span>
          )}
          <GlobalFieldWarnings warnings={fetchWarnings} />
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-6">
          <div className="grid gap-4">
            {csvHeaders.map((header, index) => (
              <FieldMappingRow
                key={header}
                csvHeader={header}
                mapping={mapping[index] || {
                  csvColumn: header,
                  contentstackField: '__skip__',
                  fieldType: 'text',
                  isRequired: false
                }}
                flattenedFields={flattenedFields}
                onMappingUpdate={(field, value) => handleMappingUpdate(index, field, value)}
              />
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
