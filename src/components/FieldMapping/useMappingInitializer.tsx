
import { useState, useCallback } from 'react';
import { FieldMapping as FieldMappingType, FlattenedField } from '@/types/contentstack';
import { getFieldType } from '@/utils/fieldUtils';
import { findMatchingField } from './FieldMatcher';

export const useMappingInitializer = () => {
  const [mapping, setMapping] = useState<FieldMappingType[]>([]);

  const initializeMapping = useCallback((fields: FlattenedField[], csvHeaders: string[]) => {
    console.log('Initializing mapping with fields:', fields);
    console.log('CSV headers to match:', csvHeaders);
    
    const initialMapping = csvHeaders.map(header => {
      const { matchingField } = findMatchingField(header, fields);
      
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
    
    console.log('Final mapping result:', initialMapping);
    setMapping(initialMapping);
  }, []);

  const updateMapping = useCallback((index: number, field: keyof FieldMappingType, value: any, flattenedFields: FlattenedField[]) => {
    setMapping(prevMapping => {
      const newMapping = [...prevMapping];
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
      
      return newMapping;
    });
  }, []);

  return {
    mapping,
    initializeMapping,
    updateMapping
  };
};
