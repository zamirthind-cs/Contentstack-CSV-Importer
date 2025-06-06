
import { ContentstackField, FlattenedField, BlockSchema } from '@/types/contentstack';

export const flattenContentstackFields = (fields: ContentstackField[], parentPath = '', parentField = ''): FlattenedField[] => {
  const flattened: FlattenedField[] = [];
  
  fields.forEach(field => {
    const fieldPath = parentPath ? `${parentPath}.${field.uid}` : field.uid;
    
    // Add the field itself (except for blocks which are containers)
    if (field.data_type !== 'blocks') {
      flattened.push({
        uid: field.uid,
        display_name: field.display_name,
        data_type: field.data_type,
        mandatory: field.mandatory,
        reference_to: field.reference_to,
        fieldPath,
        parentField: parentField || undefined
      });
    }
    
    // Handle modular blocks
    if (field.data_type === 'blocks' && field.blocks) {
      field.blocks.forEach(block => {
        block.schema.forEach(blockField => {
          const blockFieldPath = `${fieldPath}.${block.uid}.${blockField.uid}`;
          flattened.push({
            uid: blockField.uid,
            display_name: `${field.display_name} > ${block.title} > ${blockField.display_name}`,
            data_type: blockField.data_type,
            mandatory: blockField.mandatory,
            reference_to: blockField.reference_to,
            fieldPath: blockFieldPath,
            parentField: field.uid,
            blockType: block.uid
          });
        });
      });
    }
    
    // Handle global fields (they have nested schema)
    if (field.data_type === 'global_field' && field.schema) {
      const nestedFields = flattenContentstackFields(field.schema, fieldPath, field.uid);
      flattened.push(...nestedFields);
    }
  });
  
  return flattened;
};

export const getFieldType = (dataType: string): 'text' | 'number' | 'boolean' | 'date' | 'reference' | 'file' | 'blocks' | 'global_field' => {
  switch (dataType) {
    case 'number': return 'number';
    case 'boolean': return 'boolean';
    case 'isodate': return 'date';
    case 'reference': return 'reference';
    case 'file': return 'file';
    case 'blocks': return 'blocks';
    case 'global_field': return 'global_field';
    default: return 'text';
  }
};

export const transformNestedValue = async (
  value: string,
  fieldPath: string,
  fieldMapping: any,
  transformValue: (value: string, mapping: any) => Promise<any>
): Promise<any> => {
  if (!value || value.trim() === '') return null;
  
  const pathParts = fieldPath.split('.');
  
  // Handle simple fields
  if (pathParts.length === 1) {
    return await transformValue(value, fieldMapping);
  }
  
  // Handle nested fields (blocks or global fields)
  if (pathParts.length === 3 && fieldMapping.blockType) {
    // This is a modular block field: fieldName.blockType.fieldName
    const transformedValue = await transformValue(value, fieldMapping);
    return {
      blockType: fieldMapping.blockType,
      fieldName: pathParts[2],
      value: transformedValue
    };
  }
  
  // Handle global field nested values
  if (pathParts.length === 2) {
    const transformedValue = await transformValue(value, fieldMapping);
    return {
      [pathParts[1]]: transformedValue
    };
  }
  
  return await transformValue(value, fieldMapping);
};

export const mergeNestedData = (existingData: any, newData: any, fieldPath: string): any => {
  const pathParts = fieldPath.split('.');
  const result = { ...existingData };
  
  if (pathParts.length === 1) {
    // Simple field
    result[pathParts[0]] = newData;
  } else if (pathParts.length === 3) {
    // Modular block field: fieldName.blockType.fieldName
    const [fieldName, blockType, blockFieldName] = pathParts;
    
    if (!result[fieldName]) {
      result[fieldName] = [];
    }
    
    // Find existing block or create new one
    let existingBlock = result[fieldName].find((block: any) => Object.keys(block)[0] === blockType);
    if (!existingBlock) {
      existingBlock = { [blockType]: {} };
      result[fieldName].push(existingBlock);
    }
    
    // Set the field value directly (not nested)
    existingBlock[blockType][blockFieldName] = newData.value;
  } else if (pathParts.length === 2) {
    // Global field: globalFieldName.fieldName
    const [globalFieldName, fieldName] = pathParts;
    
    if (!result[globalFieldName]) {
      result[globalFieldName] = {};
    }
    
    result[globalFieldName][fieldName] = newData;
  }
  
  return result;
};
