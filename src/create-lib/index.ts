#! /usr/bin/env node

import path from 'path';
import util from 'util';
import fs from 'fs';
import { exec as _exec } from 'child_process';
const exec = util.promisify(_exec);

function isUsingYarn() {
    return (process.env.npm_config_user_agent || '').indexOf('yarn') === 0;
}

async function runCmd(command: string) {
    try {
        const { stdout, stderr } = await exec(command);
        console.log(stdout);
        console.log(stderr);
    } catch (error) {
        console.log('\x1b[31m', error, '\x1b[0m');
    }
}

if (process.argv.length < 3) {
    console.log('\x1b[31m', 'You have to provide name to your app.');
    console.log('For example:');
    console.log(
        isUsingYarn()
            ? '    yarn create document-model-lib my-app'
            : '    npx create-document-model-lib my-app',
        '\x1b[0m',
    );
    process.exit(1);
}

const ownPath = process.cwd();
const folderName = process.argv[2];
const appPath = path.join(ownPath, folderName);
const repo = 'https://github.com/powerhouse-inc/document-model-boilerplate.git';

try {
    fs.mkdirSync(appPath);
} catch (err) {
    if ((err as { code: string }).code === 'EEXIST') {
        console.log(
            '\x1b[31m',
            `The folder ${folderName} already exists in the current directory, please give it another name.`,
            '\x1b[0m',
        );
    } else {
        console.log(err);
    }
    process.exit(1);
}

async function setup() {
    try {
        const useYarn = isUsingYarn();
        console.log(
            '\x1b[33m',
            'Downloading the project structure...',
            '\x1b[0m',
        );
        await runCmd(`git clone --depth 1 ${repo} ${folderName}`);

        process.chdir(appPath);

        console.log('\x1b[34m', 'Installing dependencies...', '\x1b[0m');
        await runCmd(useYarn ? 'yarn install' : 'npm install');
        console.log();

        fs.rmSync(path.join(appPath, './.git'), { recursive: true });
        await runCmd('git init');

        fs.mkdirSync(path.join(appPath, 'document-models'));

        const packageJson = JSON.parse(
            fs.readFileSync(path.join(appPath, 'package.json'), 'utf-8'),
        );
        buildPackageJson(packageJson, folderName);

        console.log('\x1b[32m', 'The installation is done!', '\x1b[0m');
        console.log();

        console.log('\x1b[34m', 'You can start by typing:');
        console.log(`    cd ${folderName}`);
        console.log(
            useYarn ? '    yarn generate' : '    npm run generate',
            '\x1b[0m',
        );
        console.log();
    } catch (error) {
        console.log(error);
    }
}

setup();

function buildPackageJson(packageJson: any, folderName: string) {
    const newPackage = {
        ...packageJson,
        name: folderName,
        version: '1.0.0',
        description: '',
    };

    fs.writeFileSync(
        path.join(appPath, 'package.json'),
        JSON.stringify(newPackage, null, 2),
        'utf8',
    );
}
