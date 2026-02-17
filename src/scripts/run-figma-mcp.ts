import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from the project root .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Configuration
const REQUIRED_PORT = 3845;

// Map FIGMA_ACCESS_TOKEN (standard) to FIGMA_API_KEY (server requirement)
if (process.env.FIGMA_ACCESS_TOKEN && !process.env.FIGMA_API_KEY) {
    process.env.FIGMA_API_KEY = process.env.FIGMA_ACCESS_TOKEN;
}

// Set required port for the server (override .env PORT=3000)
process.env.PORT = REQUIRED_PORT.toString();

// Ensure the server runs in SSE mode
if (!process.argv.includes('--sse')) {
    process.argv.push('--sse');
}

console.log(`[Figma MCP] Starting server on port ${process.env.PORT}...`);
console.log(`[Figma MCP] Mode: SSE`);

// Execute the server
// We use dynamic import to ensure environment variables are set before the module loads
// and to rely on tsx handling the .ts extension and execution

try {
    // Using require to locate the module path might be tricky for TS files in node_modules
    // But given standard node resolution, we can try to import it.
    // However, since we are in a TS project using tsx, dynamic import should work if we point to the file.

    // We need to resolve the absolute path to ensure we hit the right file
    const resolvedPath = require.resolve('figma-mcp-server/mcpServer.ts');
    import(resolvedPath).catch(err => {
        console.error('Failed to start Figma MCP server:', err);
        process.exit(1);
    });
} catch (error) {
    console.error('Could not resolve figma-mcp-server/mcpServer.ts. Make sure the package is installed.');
    console.error(error);
    process.exit(1);
}
