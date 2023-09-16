#! /usr/bin/env node

import path from 'path';
import util from 'util';
import fs from 'fs';
import { exec as _exec } from 'child_process';
import { promptDirectories, DEFAULT_CONFIG, argsSpec } from '../utils';
import arg from 'arg';
import { prompt } from 'enquirer';

const exec = util.promisify(_exec);

const BOILERPLATE_REPO =
    'https://github.com/powerhouse-inc/document-model-boilerplate.git';

function isUsingYarn() {
    return (process.env.npm_config_user_agent || '').indexOf('yarn') === 0;
}

function buildPackageJson(appPath: string, projectName: string) {
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(appPath, 'package.json'), 'utf-8'),
    );
    const newPackage = {
        ...packageJson,
        name: projectName,
        version: '1.0.0',
        description: '',
    };

    fs.writeFileSync(
        path.join(appPath, 'package.json'),
        JSON.stringify(newPackage, null, 2),
        'utf8',
    );
}

function buildPowerhouseConfig(
    appPath: string,
    documentModelsDir: string,
    editorsDir: string,
) {
    const packageJson = JSON.parse(
        fs.readFileSync(path.join(appPath, 'powerhouse.config.json'), 'utf-8'),
    );
    const newPackage = {
        ...packageJson,
        documentModelsDir,
        editorsDir,
    };

    fs.writeFileSync(
        'powerhouse.config.json',
        JSON.stringify(newPackage, null, 2),
        'utf8',
    );
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

async function init() {
    const args = arg(argsSpec, {
        permissive: true,
        argv: process.argv.slice(2),
    });

    // checks if a project name was provided
    let projectName = args._.shift();
    if (!projectName) {
        const result = await prompt<{ projectName: string }>([
            {
                type: 'input',
                name: 'projectName',
                message: 'What is the project name?',
                required: true,
            },
        ]);
        if (!result.projectName) {
            console.log('\x1b[31m', 'You have to provide name to your app.');
            process.exit(1);
        }
        projectName = result.projectName;
    }

    const { documentModelsDir, editorsDir } = args['--interactive']
        ? await promptDirectories()
        : DEFAULT_CONFIG;

    const appPath = path.join(process.cwd(), projectName);

    try {
        fs.mkdirSync(appPath);
    } catch (err) {
        if ((err as { code: string }).code === 'EEXIST') {
            console.log(
                '\x1b[31m',
                `The folder ${projectName} already exists in the current directory, please give it another name.`,
                '\x1b[0m',
            );
        } else {
            console.log(err);
        }
        process.exit(1);
    }

    createProject(projectName, documentModelsDir, editorsDir);
}

async function createProject(
    projectName: string,
    documentModelsDir: string,
    editorsDir: string,
) {
    try {
        const useYarn = isUsingYarn();
        console.log(
            '\x1b[33m',
            'Downloading the project structure...',
            '\x1b[0m',
        );
        await runCmd(`git clone --depth 1 ${BOILERPLATE_REPO} ${projectName}`);

        const appPath = path.join(process.cwd(), projectName);
        process.chdir(appPath);

        console.log('\x1b[34m', 'Installing dependencies...', '\x1b[0m');
        await runCmd(useYarn ? 'yarn install' : 'npm install');
        console.log();

        fs.rmSync(path.join(appPath, './.git'), { recursive: true });
        await runCmd('git init');

        fs.mkdirSync(path.join(appPath, documentModelsDir));
        fs.mkdirSync(path.join(appPath, editorsDir));

        buildPackageJson(appPath, projectName);
        buildPowerhouseConfig(appPath, documentModelsDir, editorsDir);

        console.log('\x1b[32m', 'The installation is done!', '\x1b[0m');
        console.log();

        console.log('\x1b[34m', 'You can start by typing:');
        console.log(`    cd ${projectName}`);
        console.log(
            useYarn ? '    yarn generate' : '    npm run generate',
            '\x1b[0m',
        );
        console.log();
    } catch (error) {
        console.log(error);
    }
}

init();
