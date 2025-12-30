import { generateOpenAPIDocument } from "./src/openapi-registry";

const spec = generateOpenAPIDocument();
console.log(JSON.stringify(spec, null, 2));
