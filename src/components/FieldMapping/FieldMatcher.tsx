
import { FlattenedField } from '@/types/contentstack';

export interface FieldMatchResult {
  matchingField: FlattenedField | undefined;
  matchType: 'uid' | 'display' | 'path' | 'none';
}

export const findMatchingField = (
  header: string, 
  fields: FlattenedField[]
): FieldMatchResult => {
  console.log(`\nTrying to match CSV header: "${header}"`);
  
  const lowerHeader = header.toLowerCase();
  
  for (const field of fields) {
    const uidMatch = field.uid.toLowerCase() === lowerHeader;
    const displayNameMatch = field.display_name.toLowerCase() === lowerHeader;
    const pathMatch = field.fieldPath.toLowerCase() === lowerHeader;
    
    console.log(`  Checking field: ${field.uid} (${field.display_name}) - path: ${field.fieldPath}`);
    console.log(`    UID match: ${uidMatch}, Display name match: ${displayNameMatch}, Path match: ${pathMatch}`);
    
    if (uidMatch) {
      console.log(`  ✓ Found UID match: ${field.fieldPath} (${field.display_name})`);
      return { matchingField: field, matchType: 'uid' };
    }
    
    if (displayNameMatch) {
      console.log(`  ✓ Found display name match: ${field.fieldPath} (${field.display_name})`);
      return { matchingField: field, matchType: 'display' };
    }
    
    if (pathMatch) {
      console.log(`  ✓ Found path match: ${field.fieldPath} (${field.display_name})`);
      return { matchingField: field, matchType: 'path' };
    }
  }
  
  console.log(`  ✗ No match found for "${header}"`);
  return { matchingField: undefined, matchType: 'none' };
};
