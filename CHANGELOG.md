# [1.0.0-alpha.2](https://github.com/powerhouse-inc/document-model-electron/compare/v1.0.0-alpha.1...v1.0.0-alpha.2) (2023-12-20)


### Bug Fixes

* allow concurrent drive operations ([17658ee](https://github.com/powerhouse-inc/document-model-electron/commit/17658ee1a67dc787896508d25ea329ca9b657a13))
* folder selection in folder view ([f7e3681](https://github.com/powerhouse-inc/document-model-electron/commit/f7e36810b5d0223afc64736a9e8ec48e11f7fc57))
* header text color ([4ee9745](https://github.com/powerhouse-inc/document-model-electron/commit/4ee9745dbbeddf0e2ea41f6d8c4c800d9f5bfd99))
* remove duplicate package ([364afdd](https://github.com/powerhouse-inc/document-model-electron/commit/364afdde2e2c9c3d6c12d0364e6d0cfd612f5429))
* remove yalc from package json ([9e184d8](https://github.com/powerhouse-inc/document-model-electron/commit/9e184d8df68d74803e9cbf95f7cf480f97a6d03e))
* revert setSelectedDocument in addOperation document ([df06317](https://github.com/powerhouse-inc/document-model-electron/commit/df06317cc067b3f25deedb9832c1aa54d308158a))


### Features

* 🚀 added readable item path for File Items ([9f6a4ac](https://github.com/powerhouse-inc/document-model-electron/commit/9f6a4ac45318bb757e7c7c60df463e67b066771b))
* 🚀 Implemented base folder-view design ([22ad4fc](https://github.com/powerhouse-inc/document-model-electron/commit/22ad4fc5046e27016ce1a47eda3282125af4db71))
* add design system preset ([a6cb51c](https://github.com/powerhouse-inc/document-model-electron/commit/a6cb51c31d4500d31fd091f165a4f01ae37ff4d7))
* add tailwind eslint plugin ([6e639bc](https://github.com/powerhouse-inc/document-model-electron/commit/6e639bc71bddeafe855c210c0f573cec7b2ce622))
* added prepare script ([abeaa41](https://github.com/powerhouse-inc/document-model-electron/commit/abeaa41bb7bfc7a8d3a7332a9dd0ba0dad088659))
* added support for delete option in FolderItem and FileItem ([85800ab](https://github.com/powerhouse-inc/document-model-electron/commit/85800ab374da9be041d6e8c547d186a0671a6b91))
* apply auto fixes ([b10b111](https://github.com/powerhouse-inc/document-model-electron/commit/b10b111374636b145c52fa15f38ebc0751912483))
* auto-select first drive if there's no selected path ([daf3083](https://github.com/powerhouse-inc/document-model-electron/commit/daf3083b4fff8dd6f033ce9806affe932fea4f04))
* enabled rename option for folders in folder view ([d7a9b34](https://github.com/powerhouse-inc/document-model-electron/commit/d7a9b3490b0cb91d647ecb803513dbea590f04e0))
* import styles from design system ([f7ac8ad](https://github.com/powerhouse-inc/document-model-electron/commit/f7ac8adc2608e8d491618e01b1c98be9f8c43fe2))
* remove old tailwind classes ([10a8b95](https://github.com/powerhouse-inc/document-model-electron/commit/10a8b95edbcf212c17cb9011b13b32d2b924a767))
* remove redundant config ([0c4d334](https://github.com/powerhouse-inc/document-model-electron/commit/0c4d334f3f75ccef7597470e1ce2a490b449eca8))
* support add drive ([f827d33](https://github.com/powerhouse-inc/document-model-electron/commit/f827d338d4b6b49bde54f58ec6eb133756f3c765))
* switch to using vars from design system ([587c258](https://github.com/powerhouse-inc/document-model-electron/commit/587c258c1f47b8f5f1004252aec491d91b14eb5a))
* updated design system dep ([b378a42](https://github.com/powerhouse-inc/document-model-electron/commit/b378a420bad20debc06aeeb376401ecb311889ce))
* use tailwind styles ([53dc69f](https://github.com/powerhouse-inc/document-model-electron/commit/53dc69f69663b4d315c03b57a64b87b274e698cd))

# 1.0.0-alpha.1 (2023-12-07)


### Bug Fixes

* change config file names in scripts ([37fa872](https://github.com/powerhouse-inc/document-model-electron/commit/37fa872932c8f455e4844e6bd838a65720ad5380))
* rename node id ([45235e5](https://github.com/powerhouse-inc/document-model-electron/commit/45235e516ce5ea52345c7ff9d1f7238ff4e9e095))


### Features

* 🚀 Added ItemsContext integration ([41fc40f](https://github.com/powerhouse-inc/document-model-electron/commit/41fc40f93420101ca9b2ec34e1b4f4cab4a43a4b))
* add generate assets hook for icons copying ([4c25ebe](https://github.com/powerhouse-inc/document-model-electron/commit/4c25ebecc94941502e35dff28555664b3985f67b))
* added open file and delete file ([01793c8](https://github.com/powerhouse-inc/document-model-electron/commit/01793c8a5f21b8e1701e649cc926c8baa7ece4fe))
* added sort nodes + fix input styles + cancel new folders with empty name ([4a2f9fb](https://github.com/powerhouse-inc/document-model-electron/commit/4a2f9fbf2c4dc5427c58633f18e40eb10574600c))
* cancel rename operation when new name is empty ([6c7a815](https://github.com/powerhouse-inc/document-model-electron/commit/6c7a815500339ebbced23214450750bacbfdebc9))
* enabled rename option when copy/move an item ([3ef5ea4](https://github.com/powerhouse-inc/document-model-electron/commit/3ef5ea474997e10b670a989460dca939431f3a9a))
* implemented rename and new folder actions ([45dbf5e](https://github.com/powerhouse-inc/document-model-electron/commit/45dbf5e527841f1107f9d444ac2b76f0dc6fa7c0))
* port config files to ts ([f78e7f5](https://github.com/powerhouse-inc/document-model-electron/commit/f78e7f5444a47d637cc6681dd25917524b03b659))
* re-implemented copy/move nodes with new DocumentDrive ([c4fad11](https://github.com/powerhouse-inc/document-model-electron/commit/c4fad117827b929d69dd73824d46ef33f767c57f))
