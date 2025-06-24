
import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { ContentstackConfig, CsvData, FieldMapping as FieldMappingType, FlattenedField, ContentstackField } from '@/types/contentstack';
import { flattenContentstackFields, getFieldType } from '@/utils/fieldUtils';
import { toast } from "@/components/ui/use-toast"
import { useToast } from "@/hooks/use-toast"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { cn } from "@/lib/utils"

interface FieldMappingProps {
  csvHeaders: string[];
  config: ContentstackConfig;
  onMappingComplete: (mapping: FieldMappingType[]) => void;
  initialMapping?: FieldMappingType[];
}

const FieldMapping: React.FC<FieldMappingProps> = ({ 
  csvHeaders, 
  config, 
  onMappingComplete, 
  initialMapping = [] 
}) => {
  const [fieldMapping, setFieldMapping] = useState<FieldMappingType[]>([]);
  const [flattenedFields, setFlattenedFields] = useState<FlattenedField[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [schemaError, setSchemaError] = useState<string | null>(null);

  // Initialize flattened fields
  useEffect(() => {
    const initializeFields = async () => {
      try {
        setIsLoading(true);
        setSchemaError(null);
        
        if (!config?.schema) {
          setSchemaError('No schema available');
          setIsLoading(false);
          return;
        }

        // Handle different schema structures
        let schemaFields: ContentstackField[] = [];
        
        if (Array.isArray(config.schema)) {
          schemaFields = config.schema;
        } else if (config.schema && typeof config.schema === 'object' && 'schema' in config.schema) {
          // Handle case where schema is wrapped in an object
          schemaFields = (config.schema as any).schema || [];
        } else {
          setSchemaError('Invalid schema format');
          setIsLoading(false);
          return;
        }

        const flattened = await flattenContentstackFields(schemaFields, '', '', {
          apiKey: config.apiKey,
          managementToken: config.managementToken,
          host: config.host
        });
        
        console.log('Flattened fields:', flattened);
        setFlattenedFields(flattened);
      } catch (error) {
        console.error('Error flattening fields:', error);
        setSchemaError('Error processing schema');
      } finally {
        setIsLoading(false);
      }
    };

    initializeFields();
  }, [config]);

  // Initialize field mapping based on CSV headers and flattened fields
  useEffect(() => {
    if (flattenedFields.length === 0 || csvHeaders.length === 0) return;
    
    if (initialMapping.length > 0) {
      console.log('Using initial mapping:', initialMapping);
      setFieldMapping(initialMapping);
      return;
    }

    console.log('Auto-mapping CSV headers to fields...');
    const mapping: FieldMappingType[] = csvHeaders.map(header => {
      console.log(`Trying to map CSV header: "${header}"`);
      
      // Try to auto-match based on field UID or display name
      const matchedField = flattenedFields.find(field => {
        const headerLower = header.toLowerCase();
        const uidLower = field.uid.toLowerCase();
        const displayNameLower = field.display_name.toLowerCase();
        const pathLower = field.fieldPath.toLowerCase();
        
        // Exact matches
        if (uidLower === headerLower || displayNameLower === headerLower || pathLower === headerLower) {
          return true;
        }
        
        // Partial matches for common fields
        if (headerLower.includes('title') && (uidLower.includes('title') || displayNameLower.includes('title'))) {
          return true;
        }
        
        if (headerLower.includes('url') && (uidLower.includes('url') || displayNameLower.includes('url'))) {
          return true;
        }
        
        if (headerLower.includes('body') && (uidLower.includes('body') || displayNameLower.includes('body'))) {
          return true;
        }
        
        return false;
      });

      if (matchedField) {
        console.log(`✓ Matched "${header}" to field: ${matchedField.uid} (${matchedField.display_name})`);
        return {
          csvColumn: header,
          contentstackField: matchedField.fieldPath,
          fieldType: getFieldType(matchedField.data_type),
          isRequired: matchedField.mandatory,
          referenceContentType: matchedField.reference_to?.[0],
          blockType: matchedField.blockType,
          parentField: matchedField.parentField,
          selectOptions: matchedField?.selectOptions
        };
      }

      console.log(`✗ No match found for "${header}"`);
      // Default to skip if no match found
      return {
        csvColumn: header,
        contentstackField: 'skip',
        fieldType: 'text' as const,
        isRequired: false
      };
    });

    console.log('Final mapping:', mapping);
    setFieldMapping(mapping);
  }, [csvHeaders, flattenedFields, initialMapping]);

  const handleFieldChange = (index: number, contentstackField: string) => {
    console.log(`Changing field mapping for index ${index} to: ${contentstackField}`);
    
    setFieldMapping(prevMapping => {
      const newMapping = [...prevMapping];
      const matchedField = flattenedFields.find(field => field.fieldPath === contentstackField);

      newMapping[index] = {
        ...newMapping[index],
        csvColumn: csvHeaders[index],
        contentstackField: contentstackField,
        fieldType: matchedField ? getFieldType(matchedField.data_type) : 'text',
        isRequired: matchedField ? matchedField.mandatory : false,
        referenceContentType: matchedField?.reference_to?.[0],
        blockType: matchedField?.blockType,
        parentField: matchedField?.parentField,
        selectOptions: matchedField?.selectOptions
      };
      return newMapping;
    });
  };

  const handleSubmit = () => {
    const hasUnmappedRequiredFields = fieldMapping.some(mapping => {
      const field = flattenedFields.find(f => f.fieldPath === mapping.contentstackField);
      return field?.mandatory === true && mapping.contentstackField === 'skip';
    });
  
    if (hasUnmappedRequiredFields) {
      toast({
        title: "Error",
        description: "Please map all required fields before submitting.",
        variant: "destructive",
      });
      return;
    }
  
    onMappingComplete(fieldMapping);
  };

  if (isLoading) {
    return <Card className="shadow-md"><CardContent>Loading schema...</CardContent></Card>;
  }

  if (schemaError) {
    return <Card className="shadow-md"><CardContent>Error: {schemaError}</CardContent></Card>;
  }

  return (
    <Card className="shadow-md">
      <CardHeader>
        <CardTitle>Field Mapping</CardTitle>
        <CardDescription>Map your CSV columns to Contentstack fields.</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">CSV Header</TableHead>
              <TableHead>Contentstack Field</TableHead>
              <TableHead className="w-[150px]">Field Info</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {csvHeaders.map((header, index) => {
              const mapping = fieldMapping[index];
              const field = flattenedFields.find(f => f.fieldPath === mapping?.contentstackField);
              
              return (
                <TableRow key={index}>
                  <TableCell className="font-medium">{header}</TableCell>
                  <TableCell>
                    <Select 
                      value={mapping?.contentstackField || 'skip'} 
                      onValueChange={(value) => handleFieldChange(index, value)}
                    >
                      <SelectTrigger className="w-[350px]">
                        <SelectValue placeholder="Select a field" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="skip">Skip this column</SelectItem>
                        {flattenedFields.map(field => (
                          <SelectItem key={field.fieldPath} value={field.fieldPath}>
                            {field.display_name} ({field.fieldPath})
                            {field.data_type === 'select' && ' - Select Field'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs space-y-1">
                      {field && field.data_type === 'select' && field.selectOptions && (
                        <div className="text-blue-600">
                          <div className="font-medium">Select Options:</div>
                          <div className="max-h-20 overflow-y-auto">
                            {field.selectOptions.map((option, idx) => (
                              <div key={idx} className="truncate">
                                {option.text} ({option.value})
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {field?.mandatory && (
                        <span className="text-red-500 font-medium">Required</span>
                      )}
                      {field && (
                        <div className="text-gray-500">
                          Type: {field.data_type}
                        </div>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        <Button className="mt-4" onClick={handleSubmit}>Complete Mapping</Button>
      </CardContent>
    </Card>
  );
};

export default FieldMapping;
