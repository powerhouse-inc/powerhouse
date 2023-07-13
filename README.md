# Document Model Editor Demo

Demo Electron app to interact with Budget Statement documents.

## Usage

Install dependencies:

```bash
$ yarn install
```

Start development mode:

```bash
$ yarn start
```

Create package for the current platform:

```bash
$ yarn make
```

Build for Mac OSX: (only works on Mac)

```bash
$ npm make:mac
```

Build for Linux (deb and dpkg): (works on Linux or Mac)

```bash
$ npm make:linux
```

Build for Windows: (only works on Windows)

```bash
$ npm make:windows
```

## Troubleshooting

- For a complete list of *Electron Forge* options and requirements, visit the [official docs](https://github.com/electron-userland/electron-forge#usage).

 - If you're experiencing troubles with node-gyp on Windows 11, follow [this guide](https://devkimchi.com/2021/11/26/troubleshooting-node-gyp-package-on-windows11/).

 - If you're experiencing troubles with node-gyp on older versions, check out [this guide](https://spin.atomicobject.com/2019/03/27/node-gyp-windows/).

 - To use yarn via Windows PowerShell, check [this guide](https://bobbyhadz.com/blog/yarn-cannot-be-loaded-running-scripts-disabled)