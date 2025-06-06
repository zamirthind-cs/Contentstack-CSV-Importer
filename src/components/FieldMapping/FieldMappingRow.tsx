
import React from 'react';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { FieldMapping as FieldMappingType, FlattenedField } from '@/types/contentstack';

interface FieldMappingRowProps {
  csvHeader: string;
  mapping: FieldMappingType;
  flattenedFields: FlattenedField[];
  onMappingUpdate: (field: keyof FieldMappingType, value: any) => void;
}

const FieldMappingRow: React.FC<FieldMappingRowProps> = ({
  csvHeader,
  mapping,
  flattenedFields,
  onMappingUpdate
}) => {
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

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <Label className="text-sm font-medium">CSV Column</Label>
          <Input value={csvHeader} disabled className="bg-white" />
        </div>
        
        <div>
          <Label className="text-sm font-medium">Contentstack Field</Label>
          <Select
            value={mapping.contentstackField || '__skip__'}
            onValueChange={(value) => onMappingUpdate('contentstackField', value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select field" />
            </SelectTrigger>
            <SelectContent className="max-h-60 overflow-y-auto">
              <SelectItem value="__skip__">-- Skip this column --</SelectItem>
              {flattenedFields.map((field, fieldIndex) => {
                const { displayText, typeInfo } = getFieldDisplayInfo(field);
                const uniqueKey = `${field.fieldPath}-${fieldIndex}`;
                return (
                  <SelectItem key={uniqueKey} value={field.fieldPath}>
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
            value={mapping.fieldType || 'text'}
            disabled
            className="bg-gray-100"
          />
        </div>
      </div>
      
      {mapping.fieldType === 'reference' && (
        <div className="mt-3">
          <Label className="text-sm font-medium">Reference Content Type</Label>
          <Input
            value={mapping.referenceContentType || ''}
            onChange={(e) => onMappingUpdate('referenceContentType', e.target.value)}
            placeholder="Enter referenced content type UID"
            className="mt-1"
          />
        </div>
      )}
      
      {mapping.blockType && (
        <div className="mt-3">
          <div className="text-sm text-blue-600">
            ℹ️ This field is part of a modular block: <strong>{mapping.blockType}</strong>
          </div>
        </div>
      )}
    </div>
  );
};

export default FieldMappingRow;
