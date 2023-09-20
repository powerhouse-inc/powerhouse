#! /usr/bin/env node
import { generate, generateEditor } from './codegen/index';
import { parseArgs, getConfig, promptDirectories, parseConfig } from './utils';

async function parseCommand(argv: string[]) {
    const args = parseArgs(argv, { '--editor': String, '-e': '--editor' });
    const editorName = args['--editor'];
    return { editor: !!editorName, editorName };
}

async function main() {
    const argv = process.argv.slice(2);
    const baseConfig = getConfig();
    const argsConfig = parseConfig(argv);
    const config = { ...baseConfig, ...argsConfig };
    if (config.interactive) {
        const result = await promptDirectories(config);
        Object.assign(config, result);
    }

    const command = await parseCommand(process.argv);
    if (command.editor) {
        await generateEditor(command.editorName!, config);
    } else {
        await generate(config);
    }
}

main();
