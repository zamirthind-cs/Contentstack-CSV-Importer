
import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { ContentstackConfig, FieldMapping as FieldMappingType, ContentstackField } from '@/types/contentstack';
import { useToast } from '@/hooks/use-toast';

interface FieldMappingProps {
  csvHeaders: string[];
  config: ContentstackConfig;
  onMappingComplete: (mapping: FieldMappingType[]) => void;
}

const FieldMapping: React.FC<FieldMappingProps> = ({ csvHeaders, config, onMappingComplete }) => {
  const [mapping, setMapping] = useState<FieldMappingType[]>([]);
  const [contentstackFields, setContentstackFields] = useState<ContentstackField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    fetchContentstackFields();
  }, []);

  const fetchContentstackFields = async () => {
    try {
      const response = await fetch(`https://${config.host}/v3/content_types/${config.contentType}`, {
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
      
      setContentstackFields(fields);
      
      // Initialize mapping with empty values
      const initialMapping = csvHeaders.map(header => ({
        csvColumn: header,
        contentstackField: '__skip__',
        fieldType: 'text' as const,
        isRequired: false
      }));
      
      setMapping(initialMapping);
      setIsLoading(false);
    } catch (error) {
      toast({
        title: "Error Fetching Content Type",
        description: "Could not fetch content type schema. Please check your configuration.",
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
      const csField = contentstackFields.find(f => f.uid === value);
      if (csField) {
        newMapping[index].fieldType = getFieldType(csField.data_type);
        newMapping[index].isRequired = csField.mandatory;
        if (csField.data_type === 'reference' && csField.reference_to) {
          newMapping[index].referenceContentType = csField.reference_to[0];
        }
      }
    }
    
    setMapping(newMapping);
  };

  const getFieldType = (dataType: string): FieldMappingType['fieldType'] => {
    switch (dataType) {
      case 'number': return 'number';
      case 'boolean': return 'boolean';
      case 'isodate': return 'date';
      case 'reference': return 'reference';
      case 'file': return 'file';
      default: return 'text';
    }
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
          Map your CSV columns to Contentstack fields
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
                      <SelectContent>
                        <SelectItem value="__skip__">-- Skip this column --</SelectItem>
                        {contentstackFields.map(field => (
                          <SelectItem key={field.uid} value={field.uid}>
                            {field.display_name} ({field.data_type})
                            {field.mandatory && <span className="text-red-500"> *</span>}
                          </SelectItem>
                        ))}
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
