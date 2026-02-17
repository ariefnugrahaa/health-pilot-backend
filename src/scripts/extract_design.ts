import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const FILE_KEY = 'kgegyxtZJvihIWwK2fwUfu';
const NODES = ['2061-2302', '2061-3076', '2061-3130', '2061-2423'];
const TOKEN = process.env.FIGMA_ACCESS_TOKEN;

if (!TOKEN) {
    console.error('Error: FIGMA_ACCESS_TOKEN not found in .env');
    process.exit(1);
}

async function fetchNodes() {
    const url = `https://api.figma.com/v1/files/${FILE_KEY}/nodes?ids=${NODES.join(',')}`;
    console.log(`Fetching: ${url}`);

    const res = await fetch(url, {
        headers: { 'X-Figma-Token': TOKEN } as any
    });

    if (!res.ok) {
        throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    }

    return res.json();
}

function rgbaToHex(color: any) {
    const toHex = (n: number) => {
        const hex = Math.round(n * 255).toString(16);
        return hex.length === 1 ? '0' + hex : hex;
    }
    return `#${toHex(color.r)}${toHex(color.g)}${toHex(color.b)}`;
}

async function run() {
    try {
        const data = await fetchNodes() as any;
        const nodes = data.nodes;

        const colors = new Set<string>();
        const fonts = new Set<string>();
        const texts: any[] = [];

        // Recursive traversal to find styles
        function traverse(node: any) {
            // Fills (Colors)
            if (node.fills) {
                node.fills.forEach((fill: any) => {
                    if (fill.type === 'SOLID' && fill.visible !== false) {
                        colors.add(rgbaToHex(fill.color));
                    }
                });
            }

            // Strokes (Colors)
            if (node.strokes) {
                node.strokes.forEach((stroke: any) => {
                    if (stroke.type === 'SOLID' && stroke.visible !== false) {
                        colors.add(rgbaToHex(stroke.color));
                    }
                });
            }

            // Typography
            if (node.type === 'TEXT' && node.style) {
                const { fontFamily, fontSize, fontWeight } = node.style;
                const fontId = `${fontFamily} ${fontWeight} ${fontSize}px`;
                fonts.add(fontId);
                texts.push({
                    text: node.characters,
                    style: { fontFamily, fontWeight, fontSize }
                });
            }

            if (node.children) {
                node.children.forEach(traverse);
            }
        }

        Object.values(nodes).forEach((n: any) => traverse(n.document));

        console.log('--- EXTRACTED COLORS ---');
        console.log(Array.from(colors).sort().join('\n'));

        console.log('\n--- EXTRACTED FONTS ---');
        console.log(Array.from(fonts).sort().join('\n'));

        // Dump sample text to see implementation details
        // console.log(JSON.stringify(texts.slice(0, 5), null, 2));

        console.log('Node Keys:', Object.keys(nodes));
        console.log('Node Keys:', Object.keys(nodes));

        Object.entries(nodes).forEach(([key, node]: [string, any]) => {
            console.log(`\n--- NODE ${key} TEXT CONTENT ---`);
            const stepTexts: string[] = [];
            function collectText(n: any) {
                if (n.type === 'TEXT') stepTexts.push(n.characters);
                if (n.children) n.children.forEach(collectText);
            }
            collectText(node.document);
            console.log(stepTexts.join('\n'));
        });
    } catch (err) {
        console.error(err);
    }
}

run();
