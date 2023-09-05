#! /usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const util_1 = __importDefault(require("util"));
const fs_1 = __importDefault(require("fs"));
const child_process_1 = require("child_process");
const exec = util_1.default.promisify(child_process_1.exec);
function runCmd(command) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const { stdout, stderr } = yield exec(command);
            console.log(stdout);
            console.log(stderr);
        }
        catch (error) {
            console.log('\x1b[31m', error, '\x1b[0m');
        }
    });
}
if (process.argv.length < 3) {
    console.log('\x1b[31m', 'You have to provide name to your app.');
    console.log('For example:');
    console.log('    npx create-document-model-lib my-app', '\x1b[0m');
    process.exit(1);
}
const ownPath = process.cwd();
const folderName = process.argv[2];
const appPath = path_1.default.join(ownPath, folderName);
const repo = 'https://github.com/powerhouse-inc/document-model-boilerplate.git';
try {
    fs_1.default.mkdirSync(appPath);
}
catch (err) {
    if (err.code === 'EEXIST') {
        console.log('\x1b[31m', `The file ${folderName} already exist in the current directory, please give it another name.`, '\x1b[0m');
    }
    else {
        console.log(err);
    }
    process.exit(1);
}
function setup() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            console.log('\x1b[33m', 'Downloading the project structure...', '\x1b[0m');
            yield runCmd(`git clone --depth 1 ${repo} ${folderName}`);
            process.chdir(appPath);
            console.log('\x1b[34m', 'Installing dependencies...', '\x1b[0m');
            yield runCmd('yarn install');
            console.log();
            fs_1.default.rmdirSync(path_1.default.join(appPath, './.git'), { recursive: true });
            fs_1.default.mkdirSync(path_1.default.join(appPath, 'schemas'));
            fs_1.default.mkdirSync(path_1.default.join(appPath, 'document-models'));
            // fs.unlinkSync(path.join(appPath, 'LICENSE.MD'));
            // fs.rmdirSync(path.join(appPath, 'bin'), { recursive: true });
            const packageJson = JSON.parse(fs_1.default.readFileSync(path_1.default.join(appPath, 'package.json'), 'utf-8'));
            buildPackageJson(packageJson, folderName);
            console.log('\x1b[32m', 'The installation is done!', '\x1b[0m');
            console.log();
            console.log('\x1b[34m', 'You can start by typing:');
            console.log(`    cd ${folderName}`);
            console.log('    yarn generate', '\x1b[0m');
            console.log();
        }
        catch (error) {
            console.log(error);
        }
    });
}
setup();
function buildPackageJson(packageJson, folderName) {
    const newPackage = Object.assign({}, packageJson);
    Object.assign(packageJson, {
        name: folderName,
        version: '1.0.0',
        description: '',
        author: '',
    });
    fs_1.default.writeFileSync(path_1.default.join(appPath, 'package.json'), JSON.stringify(newPackage, null, 2), 'utf8');
}
