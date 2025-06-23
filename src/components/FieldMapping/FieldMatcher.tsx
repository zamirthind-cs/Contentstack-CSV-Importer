
import { FlattenedField } from '@/types/contentstack';

export interface MatchResult {
  matchingField: FlattenedField | null;
  confidence: number;
}

const normalizeText = (text: string): string => {
  return text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
};

const getTextVariations = (text: string): string[] => {
  const normalized = normalizeText(text);
  const variations = [
    normalized,
    normalized.replace(/\s/g, ''), // Remove spaces
    normalized.replace(/\s/g, '_'), // Replace spaces with underscores
    normalized.replace(/display\s*/g, ''), // Remove "display" prefix
    normalized.replace(/\s*title\s*/g, 'title'), // Normalize title variations
  ];
  
  // Add common field name mappings
  const mappings: Record<string, string[]> = {
    'title': ['display title', 'entry title', 'name'],
    'body': ['content', 'description', 'text'],
    'url': ['link', 'href', 'website'],
    'publication date': ['published date', 'publish date', 'date published'],
    'expiration date': ['expire date', 'end date', 'expires'],
  };
  
  Object.entries(mappings).forEach(([key, values]) => {
    if (values.some(v => normalized.includes(v))) {
      variations.push(key);
    }
    if (normalized === key) {
      variations.push(...values);
    }
  });
  
  return [...new Set(variations)]; // Remove duplicates
};

export const findMatchingField = (csvHeader: string, fields: FlattenedField[]): MatchResult => {
  console.log(`\nTrying to match CSV header: "${csvHeader}"`);
  
  const csvVariations = getTextVariations(csvHeader);
  console.log(`CSV variations: ${csvVariations.join(', ')}`);
  
  let bestMatch: FlattenedField | null = null;
  let bestConfidence = 0;
  
  for (const field of fields) {
    console.log(`  Checking field: ${field.uid} (${field.display_name}) - path: ${field.fieldPath}`);
    
    const fieldVariations = [
      ...getTextVariations(field.uid),
      ...getTextVariations(field.display_name),
      ...getTextVariations(field.fieldPath)
    ];
    
    // Check for exact matches first (highest confidence)
    if (field.uid === csvHeader) {
      console.log(`  ✓ Found exact UID match: ${field.uid} (${field.display_name})`);
      return { matchingField: field, confidence: 100 };
    }
    
    if (field.display_name === csvHeader) {
      console.log(`  ✓ Found exact display name match: ${field.uid} (${field.display_name})`);
      return { matchingField: field, confidence: 95 };
    }
    
    if (field.fieldPath === csvHeader) {
      console.log(`  ✓ Found exact path match: ${field.uid} (${field.display_name})`);
      return { matchingField: field, confidence: 90 };
    }
    
    // Check for variation matches
    let confidence = 0;
    for (const csvVar of csvVariations) {
      for (const fieldVar of fieldVariations) {
        if (csvVar === fieldVar && csvVar.length > 2) { // Avoid matching very short strings
          confidence = Math.max(confidence, 80);
          break;
        }
      }
    }
    
    console.log(`    Confidence: ${confidence}`);
    
    if (confidence > bestConfidence) {
      bestMatch = field;
      bestConfidence = confidence;
    }
  }
  
  if (bestMatch && bestConfidence >= 70) {
    console.log(`  ✓ Found best match: ${bestMatch.uid} (${bestMatch.display_name}) with confidence ${bestConfidence}`);
    return { matchingField: bestMatch, confidence: bestConfidence };
  }
  
  console.log(`  ✗ No match found for "${csvHeader}"`);
  return { matchingField: null, confidence: 0 };
};
