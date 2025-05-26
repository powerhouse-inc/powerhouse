# Website

This documentation website is built using [Docusaurus](https://docusaurus.io/), a modern static website generator.
To contribute to the documentation please work on a feature branch in case of big refactors, and build & serve before pushing to the development branch. 
Pushing from the dev branch to the main branch will trigger an auto deployment in Heroku for the staging deployment. 

### Installation

```
$ npm install
```

### Local Development

```
$ npm run dev
```

This command starts a local development server and opens up a browser window. Most changes are reflected live without having to restart the server.

### Build

```
$ npm run build
```

This command generates static content into the `build` directory and can be served using any static contents hosting service.

### Deployment

Using SSH:

```
$ USE_SSH=true yarn deploy
```

Not using SSH:

```
$ GIT_USER=<Your GitHub username> yarn deploy
```

If you are using GitHub pages for hosting, this command is a convenient way to build the website and push to the `gh-pages` branch.
