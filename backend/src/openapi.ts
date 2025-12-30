import { generateOpenAPIDocument } from "./openapi-registry";

// Lazy-load the spec to avoid initialization issues
let _cachedSpec: any = null;

export function getOpenapiSpec() {
  if (!_cachedSpec) {
    _cachedSpec = generateOpenAPIDocument();
  }
  return _cachedSpec;
}

// For backward compatibility
export const openapiSpec = getOpenapiSpec();
