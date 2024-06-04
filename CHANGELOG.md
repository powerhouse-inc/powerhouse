# [1.0.0-alpha.68](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.67...v1.0.0-alpha.68) (2024-06-04)


### Bug Fixes

* redis queue ([e99d1b9](https://github.com/powerhouse-inc/document-drive/commit/e99d1b9f0c704836cc0752e36e0f905dc192e5e1))

# [1.0.0-alpha.67](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.66...v1.0.0-alpha.67) (2024-06-04)


### Features

* get operations from cache on storage ([8416464](https://github.com/powerhouse-inc/document-drive/commit/84164646609045b2cd8e9e8747e364c746d9e3ec))

# [1.0.0-alpha.66](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.65...v1.0.0-alpha.66) (2024-06-03)


### Features

* updated libs ([5e47758](https://github.com/powerhouse-inc/document-drive/commit/5e477580524a1defd92dd0bef9b160e182436ec9))

# [1.0.0-alpha.65](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.64...v1.0.0-alpha.65) (2024-05-30)


### Features

* fetch resulting state for last unskipped operation ([8297353](https://github.com/powerhouse-inc/document-drive/commit/8297353dc8eaca107d8134580dee67c3265b05b5))

# [1.0.0-alpha.64](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.63...v1.0.0-alpha.64) (2024-05-30)


### Features

* update document-model lib version ([#180](https://github.com/powerhouse-inc/document-drive/issues/180)) ([83cec58](https://github.com/powerhouse-inc/document-drive/commit/83cec58cb02388a3b2a643dd5af6c31cd850242d))

# [1.0.0-alpha.63](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.62...v1.0.0-alpha.63) (2024-05-30)


### Bug Fixes

* operations query ([8dd11c7](https://github.com/powerhouse-inc/document-drive/commit/8dd11c72058452f3e8febac472d01ad56d959e17))

# [1.0.0-alpha.62](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.61...v1.0.0-alpha.62) (2024-05-30)


### Bug Fixes

* added drive and documentId filter ([718405f](https://github.com/powerhouse-inc/document-drive/commit/718405febbe8e53a3fd392cdd4acf2b041347eaf))

# [1.0.0-alpha.61](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.60...v1.0.0-alpha.61) (2024-05-30)


### Features

* store resulting state as bytes and only retrieve state for last op of each scope ([c6a5004](https://github.com/powerhouse-inc/document-drive/commit/c6a5004a3dd07ee1ce2f5521bb7a6aa5e970465e))

# [1.0.0-alpha.60](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.59...v1.0.0-alpha.60) (2024-05-29)


### Features

* avoid duplicated getDocument call ([c0684bc](https://github.com/powerhouse-inc/document-drive/commit/c0684bc0746d8bafb9393cdaeebfb60b38a8a32f))

# [1.0.0-alpha.59](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.58...v1.0.0-alpha.59) (2024-05-28)


### Features

* enable operation id ([#174](https://github.com/powerhouse-inc/document-drive/issues/174)) ([1d77fd2](https://github.com/powerhouse-inc/document-drive/commit/1d77fd2f6a4618371c6fc4c072d4eab7d27a662a))

# [1.0.0-alpha.58](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.57...v1.0.0-alpha.58) (2024-05-28)


### Features

* don't save queue job result ([efbf239](https://github.com/powerhouse-inc/document-drive/commit/efbf239e5f77592267446d5c11d670a82f1f6e58))

# [1.0.0-alpha.57](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.56...v1.0.0-alpha.57) (2024-05-22)


### Features

* new release ([17796e8](https://github.com/powerhouse-inc/document-drive/commit/17796e8577d16d3095a8adf3c40e7bd7146b6142))

# [1.0.0-alpha.56](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.55...v1.0.0-alpha.56) (2024-05-22)


### Features

* add queues and append only conflict resolution ([d17abd6](https://github.com/powerhouse-inc/document-drive/commit/d17abd664a7381f80faa6530f83ca9e224282ba1)), closes [#153](https://github.com/powerhouse-inc/document-drive/issues/153)

# 1.0.0-experimental.1 (2024-05-15)


### Bug Fixes

* acknowledge porper document ([c7abd01](https://github.com/powerhouse-inc/document-drive/commit/c7abd0138346b2482546a7a731b22be3e61c8ccd))
* add exports ([#157](https://github.com/powerhouse-inc/document-drive/issues/157)) ([1c74344](https://github.com/powerhouse-inc/document-drive/commit/1c74344f225aa0dc12b06603937c137b6be2afe7))
* added exports ([04958fb](https://github.com/powerhouse-inc/document-drive/commit/04958fb7c6595bc5e700196e481c4746e6702301))
* added name field to getDocument ([2cba21a](https://github.com/powerhouse-inc/document-drive/commit/2cba21aa6c4efcde50d8524f46dd22804b96f7d0))
* apply auto lint ([803cf91](https://github.com/powerhouse-inc/document-drive/commit/803cf91b3c427dd9c6b1ef9a76c92a4cfa480fbd))
* cast result of json parse ([83ee12b](https://github.com/powerhouse-inc/document-drive/commit/83ee12be711c74047eb7a4a86e235b7ab16e0a69))
* delete drive handling ([6547274](https://github.com/powerhouse-inc/document-drive/commit/6547274d4ebe02e737aa429699af39fbabe2184b))
* duplicate driv entry ([c89c27e](https://github.com/powerhouse-inc/document-drive/commit/c89c27e892a2b1d345cf5b28b00722f3cef88228))
* generate drive Id if empty string ([9c5044c](https://github.com/powerhouse-inc/document-drive/commit/9c5044cb21b9f311b999ab60612e8e61991d0dad))
* handle signals in sequence ([9660b08](https://github.com/powerhouse-inc/document-drive/commit/9660b089e554e570ff6312645b799e1af9e09596))
* missing operations in return values ([6d6cf56](https://github.com/powerhouse-inc/document-drive/commit/6d6cf56426d75b41aad1df0e8735e2a3dcc34221))
* operation data filter ([0e91f21](https://github.com/powerhouse-inc/document-drive/commit/0e91f2110a5942404b864199af8ebabd00112dea))
* prisma schema ([bac17dd](https://github.com/powerhouse-inc/document-drive/commit/bac17ddd305788252529706c0c2e8b2207c64838))
* queue actions ([8a9f3c0](https://github.com/powerhouse-inc/document-drive/commit/8a9f3c0ed0ff78fcebf3630ca3c3b64c245a3baf))
* remove react settings ([6e11865](https://github.com/powerhouse-inc/document-drive/commit/6e1186575de9a457add141fc916d6ea78fd066d5))
* remove sentry ([75faf6a](https://github.com/powerhouse-inc/document-drive/commit/75faf6acff391bb2f5fac016190a481019a225ee))
* reverse since change ([3e09362](https://github.com/powerhouse-inc/document-drive/commit/3e093623ca2f315e7faebeee3b3f3fc42bad083b))
* semantic release ([94077da](https://github.com/powerhouse-inc/document-drive/commit/94077da1f383ee2bf1530af9a4f2749cbc8d4e89))
* transmitter not found ([0fac28b](https://github.com/powerhouse-inc/document-drive/commit/0fac28b6f3de37b13899075c88fd37a9ce355013))
* types ([37ebeca](https://github.com/powerhouse-inc/document-drive/commit/37ebeca0ff18a8f60c4604ace6ba17bad730f4cb))
* update revision field if new operations are added ([45eb259](https://github.com/powerhouse-inc/document-drive/commit/45eb259b479655dde575835ce5c1aa6ad68a94f1))
* wording issues ([fcbb994](https://github.com/powerhouse-inc/document-drive/commit/fcbb994d49eb035cdb9e553b104b6c8279b7fbef))


### Features

* add ts-reset lib ([760c3fb](https://github.com/powerhouse-inc/document-drive/commit/760c3fbe685775be506835a1975541539c8fb862))
* add unique constraint on operation index ([b058834](https://github.com/powerhouse-inc/document-drive/commit/b058834a8b48c2f6db971427e9633a91141c1079))
* added .env.example ([c781094](https://github.com/powerhouse-inc/document-drive/commit/c781094ad7f7312efeee3e94695e809c5d4c6722))
* added acknowledge function to pull responder ([e72a721](https://github.com/powerhouse-inc/document-drive/commit/e72a721713bb947b0ba93be1c38797e209865e5c))
* added addAction methods and addInternalListener ([9a076b3](https://github.com/powerhouse-inc/document-drive/commit/9a076b3155060825d442351a2cd36d935a17ca44))
* added basic implementation of push and pull transmitter ([1ffb004](https://github.com/powerhouse-inc/document-drive/commit/1ffb00443bf442a17e545f2451e9b399edfcc0d3))
* added basic push strands implementatioN ([c858b75](https://github.com/powerhouse-inc/document-drive/commit/c858b7544365429ce4535a6c849cf785a5cafcd5))
* added basic transmitters ([996ff0f](https://github.com/powerhouse-inc/document-drive/commit/996ff0f0c7ea212f1ed96ebc05690d0689bf3429))
* added clearStorage support ([#82](https://github.com/powerhouse-inc/document-drive/issues/82)) ([323a93f](https://github.com/powerhouse-inc/document-drive/commit/323a93f0aaf1da1bd66b3b3292e35aefd92e9c5f))
* added clipboard flag to operations table ([f6ce677](https://github.com/powerhouse-inc/document-drive/commit/f6ce677b5e3d723074a40bb834f4029cd1c13b9a))
* added clipboard to document ([3f8c295](https://github.com/powerhouse-inc/document-drive/commit/3f8c29573cbd08f071492b56f4b31f688af7c9db))
* added debug and trace methods and logger export ([c7336de](https://github.com/powerhouse-inc/document-drive/commit/c7336de1f4b0e55a4c8d4e5efe5b063c7a4ccc88))
* added document cache ([deae523](https://github.com/powerhouse-inc/document-drive/commit/deae523851b98fcd250825a4b2918b364525660f))
* added drive events and improved sync error handling ([647c833](https://github.com/powerhouse-inc/document-drive/commit/647c8339b2166767c240a286d9ea12b032695417))
* added duplicate folders id tests ([#143](https://github.com/powerhouse-inc/document-drive/issues/143)) ([abd3688](https://github.com/powerhouse-inc/document-drive/commit/abd3688bb284257a8f088e905e1f7cf6de1f8f5d))
* added experimental release ([#155](https://github.com/powerhouse-inc/document-drive/issues/155)) ([adc52a5](https://github.com/powerhouse-inc/document-drive/commit/adc52a56655ef97de588cb03b6922ab69e72a8e9))
* added exponential retry backoff to prisma transactions ([b38e72f](https://github.com/powerhouse-inc/document-drive/commit/b38e72fdfd29f4c39e15f606fccc942ec966fffe))
* added getDrive by slug to memory adapter ([5515c34](https://github.com/powerhouse-inc/document-drive/commit/5515c34ecc18a6f14931a1a66cee454f14dbe03f))
* added getDriveBySlug ([680cf71](https://github.com/powerhouse-inc/document-drive/commit/680cf71209853689e1414f90f58f079460be94d5))
* added graphql requests for pull responder ([6578bae](https://github.com/powerhouse-inc/document-drive/commit/6578bae242a0c625531ac8b9bdec4c51727f57e6))
* added init of pullResponder ([3961916](https://github.com/powerhouse-inc/document-drive/commit/3961916bbb780c0555d3d7e106ab25c80e988c7b))
* added internal transmitter ([d728aed](https://github.com/powerhouse-inc/document-drive/commit/d728aed8ae692a83a0b998ccd6d7e36496e08b95))
* added internal transmitter service ([6863620](https://github.com/powerhouse-inc/document-drive/commit/68636202d5bfd081ef979263fd697086529a1d10))
* added listener functions ([6bc1803](https://github.com/powerhouse-inc/document-drive/commit/6bc180358826adf8a0ce6f247df37d8de245d8e7))
* added missing forceSync param ([04cd42c](https://github.com/powerhouse-inc/document-drive/commit/04cd42c5cc1f173dd04e362fde7ba2e592142d62))
* added namespace option for browser storage ([2fb312a](https://github.com/powerhouse-inc/document-drive/commit/2fb312a020d6593157c401814e0327d260f64718))
* added operation queues with memory and redis adapters ([#139](https://github.com/powerhouse-inc/document-drive/issues/139)) ([df54c4a](https://github.com/powerhouse-inc/document-drive/commit/df54c4a0ab069d0bc96cd0988967dc421c332668)), closes [#154](https://github.com/powerhouse-inc/document-drive/issues/154)
* added prisma connection ([ef87ca7](https://github.com/powerhouse-inc/document-drive/commit/ef87ca7681c4336a68f15ecf35906cdfc9c8aa0a))
* added registerListener function to PullResponderTransmitter ([814c160](https://github.com/powerhouse-inc/document-drive/commit/814c1603ef011402db30f373c3b5fbb2d3f12c58))
* added retry mechanism to transaction ([e01a2cb](https://github.com/powerhouse-inc/document-drive/commit/e01a2cb6e1c64d37655255191fc4af13254201fe))
* added semantic release ([f1c31a6](https://github.com/powerhouse-inc/document-drive/commit/f1c31a6bd2012ac6d51a7a3a5b94f656887e6b5a))
* added sequelize adapter ([#19](https://github.com/powerhouse-inc/document-drive/issues/19)) ([71529d8](https://github.com/powerhouse-inc/document-drive/commit/71529d8d60eb6ff0390bdebb1bb660fb680c99f3))
* added strandUpdate events ([1143716](https://github.com/powerhouse-inc/document-drive/commit/11437161fd1b0b0f37a7ef50833022507e4699f3))
* added support for update noop operations ([#42](https://github.com/powerhouse-inc/document-drive/issues/42)) ([c59e15a](https://github.com/powerhouse-inc/document-drive/commit/c59e15a69f08f2abe654ce15c090f1212aee7606))
* added update operations in prisma storage addDocumentOperations ([#71](https://github.com/powerhouse-inc/document-drive/issues/71)) ([eeb96af](https://github.com/powerhouse-inc/document-drive/commit/eeb96afbad520f90ce8c9b71bf573950dadadf4b))
* added winston as default logger ([77c2451](https://github.com/powerhouse-inc/document-drive/commit/77c2451e4ceaddb11dd378a89f89c4245db51cb0))
* also transmit scope state on internal transmitters ([c75a5d5](https://github.com/powerhouse-inc/document-drive/commit/c75a5d5b01ddaf166f0d86cd0afab4f888757a17))
* avoid duplicating sync units on listener manager ([ad9a015](https://github.com/powerhouse-inc/document-drive/commit/ad9a015d8b50ba444362b85b1f57b9349037c325))
* bug fixing ([1bb6097](https://github.com/powerhouse-inc/document-drive/commit/1bb60972588b5b95d2bb52354d8b35319d21eed5))
* bump document-model dep ([7442070](https://github.com/powerhouse-inc/document-drive/commit/744207006dad191e214f0547d78d185530476560))
* bump libs ([8b18624](https://github.com/powerhouse-inc/document-drive/commit/8b18624c05792d086b31a0b42b99cf42f3dc0627))
* bump lint deps ([c4a68c9](https://github.com/powerhouse-inc/document-drive/commit/c4a68c9d1c8fea85d85d18eebf66a53d57438dbd))
* cache updated document as soon as possible ([0b3327c](https://github.com/powerhouse-inc/document-drive/commit/0b3327cea01b508e0c07f05dee7fdcb4a6aaea35))
* change unimportant rules to warn ([3958150](https://github.com/powerhouse-inc/document-drive/commit/395815033e8fe5e937342b5b2ba1d57ba64cbc8d))
* check if there are conflicting operations when storing operations ([2487ab1](https://github.com/powerhouse-inc/document-drive/commit/2487ab10017ab819c560a115409829027dad9fda))
* continue initializing remaining drives if one fails ([5cd9962](https://github.com/powerhouse-inc/document-drive/commit/5cd9962785e399aa5eb06f2b87a97fed72b51178))
* defined types and functions ([0b57ae9](https://github.com/powerhouse-inc/document-drive/commit/0b57ae969f023f06ffc4859d1f8f514ef7a2508f))
* delay sync updates after receiving strands ([e1d3a87](https://github.com/powerhouse-inc/document-drive/commit/e1d3a871a99042d397b7c7928432028251fba55d))
* delete sync units before removing document ([6b54e1d](https://github.com/powerhouse-inc/document-drive/commit/6b54e1dfb7249c0c6e061e916783ac92cb5d1481))
* do not consider already skipped operations when adding operations to document ([0778863](https://github.com/powerhouse-inc/document-drive/commit/077886351a1dbde484331a30778fa4daf12cf2a2))
* don't send operation with index equal to fromRevision ([f279046](https://github.com/powerhouse-inc/document-drive/commit/f279046f156c3b9c35c1c7cdd950319078f09e04))
* emit missing operation error ([8250681](https://github.com/powerhouse-inc/document-drive/commit/82506819148565aa6a7034b8e4a6d27ec9d3a0a3))
* emit single sync status event for multiple strands ([1b9cf53](https://github.com/powerhouse-inc/document-drive/commit/1b9cf5313cca31f696c104b169d1210a3c2b829f))
* emit sync events when updating listeners ([b1899bb](https://github.com/powerhouse-inc/document-drive/commit/b1899bbe6a3d555fc6ea5236c55b1417def11ec2))
* filter out drive strand if filter excludes it ([a6d3cd2](https://github.com/powerhouse-inc/document-drive/commit/a6d3cd25e63c917cf0033429ab75d265e76bde32))
* fix adding files with documents ([b033ff9](https://github.com/powerhouse-inc/document-drive/commit/b033ff99be62a7024448c51186b26aaa6d49215c))
* fix filter operations with since timestamp ([8a19d30](https://github.com/powerhouse-inc/document-drive/commit/8a19d30f892a9862be15c670d8114f4493198245))
* fixed array access error ([ed1a3a9](https://github.com/powerhouse-inc/document-drive/commit/ed1a3a953a0a52d629eb8a69f83ce18b976076af))
* fixed date comparison ([6d28a3b](https://github.com/powerhouse-inc/document-drive/commit/6d28a3bfd6b338deaa5ede718b7a9ebc0cccf498))
* fixed state on internal transmitter strand ([5dbe930](https://github.com/powerhouse-inc/document-drive/commit/5dbe930af551375117d36f9b4d36fd613de8d9f7))
* fixed unit tests ([46edd15](https://github.com/powerhouse-inc/document-drive/commit/46edd150aa4deb8814b4d1e6bd41b13e42b6ae91))
* force deploy ([#126](https://github.com/powerhouse-inc/document-drive/issues/126)) ([e02d22e](https://github.com/powerhouse-inc/document-drive/commit/e02d22ee00471f3f20544cc27155108143d22512))
* format changelog ([99dd18b](https://github.com/powerhouse-inc/document-drive/commit/99dd18bf95b798423e4dc83c2b4fd088a612b9c8))
* get drive by id or slug ([95c171e](https://github.com/powerhouse-inc/document-drive/commit/95c171e97eb7e27a65129d7fc400fae862d62fdc))
* implementation of switchboard transmitter ([cfbdc85](https://github.com/powerhouse-inc/document-drive/commit/cfbdc8570dfc86b6fe949c5246b240c634917a99))
* implemented operation validation for document operations ([39bedf4](https://github.com/powerhouse-inc/document-drive/commit/39bedf43d2a3b1fda51d82f26b7f92b93a7cce5b))
* improve add operations insert statement ([1c238ce](https://github.com/powerhouse-inc/document-drive/commit/1c238cef779e62bf89d2341a05a3af3633b9ec59))
* improved error reporting and fixed operation hash check ([c6cc70f](https://github.com/powerhouse-inc/document-drive/commit/c6cc70f627dbdd2eab6399543fd41544fb959506))
* improved operation errors ([a05772d](https://github.com/powerhouse-inc/document-drive/commit/a05772d023c600dd85d50be65f1ee80b19d546ef))
* init listener manager ([0edb539](https://github.com/powerhouse-inc/document-drive/commit/0edb53988f691672a3c3e0ce3179142bc09b6b58))
* initial work on tests migration ([3046dc1](https://github.com/powerhouse-inc/document-drive/commit/3046dc16a0405476a0af22aaf605be6ce43bf4c5))
* instantiate listeners on server initialization ([367396d](https://github.com/powerhouse-inc/document-drive/commit/367396d8205b6ba81f7c4261d516be2eebfb664e))
* integrated append only conflict resolution ([#153](https://github.com/powerhouse-inc/document-drive/issues/153)) ([16f12b6](https://github.com/powerhouse-inc/document-drive/commit/16f12b655963bd34575a00af3deb49182a35863a))
* only add listeners once ([12ca458](https://github.com/powerhouse-inc/document-drive/commit/12ca458ce9a4b5577fc45c5a8bcca5d905bd80ee))
* only emit event when syncStatus changes ([1cedf61](https://github.com/powerhouse-inc/document-drive/commit/1cedf6110fead2410a61d0d8f261a57d11c48fa1))
* proceed with loop only after previous request is done ([d7eec70](https://github.com/powerhouse-inc/document-drive/commit/d7eec7044233c060c56e98698360070198a540dd))
* replaced winston with console ([bbb7fc5](https://github.com/powerhouse-inc/document-drive/commit/bbb7fc53fa8cb5da97c6068e95ab77d5149d87fc))
* run pull loop immediately for the first time ([802a126](https://github.com/powerhouse-inc/document-drive/commit/802a126e4ec90b5b62ad3e228cee73daa06cf651))
* set sync status success if no new strands ([7a9627c](https://github.com/powerhouse-inc/document-drive/commit/7a9627cd72c80ae3c56a933bcd92c3da87529e00))
* skip hash generation when replaying documents ([697ea35](https://github.com/powerhouse-inc/document-drive/commit/697ea35ae79a6697c8bfd4810a8d28139bf1a01f))
* stop drive sync if triggers are removed ([dcf2df2](https://github.com/powerhouse-inc/document-drive/commit/dcf2df256f43f234bfb9188c750521fb57df880f))
* store and sync operation context ([b2e5d5e](https://github.com/powerhouse-inc/document-drive/commit/b2e5d5efe59ed382fe6f984c193959218cbac4e0))
* sync protocol draft ([f5ef843](https://github.com/powerhouse-inc/document-drive/commit/f5ef8436f9dfa50b546c77363bc8edfb887d671c))
* trigger release ([a99370f](https://github.com/powerhouse-inc/document-drive/commit/a99370fbfea65bbc20f3fc3c39f0a26087795603))
* trigger release ([75d8cc7](https://github.com/powerhouse-inc/document-drive/commit/75d8cc73c7022ecb6c71945486539e3b61ad9e1d))
* trigger release ([33209d5](https://github.com/powerhouse-inc/document-drive/commit/33209d59cf4f44946b524a88c9008fef40aceea9))
* Update CHANGELOG.md ([dc9d571](https://github.com/powerhouse-inc/document-drive/commit/dc9d5712092eec57d156b967f91a3079ce6dd917))
* update config ([c0197a6](https://github.com/powerhouse-inc/document-drive/commit/c0197a6bd86cdb706883e9cd7f0cad017fa115de))
* update document-model and document-model-libs ([#145](https://github.com/powerhouse-inc/document-drive/issues/145)) ([87dff17](https://github.com/powerhouse-inc/document-drive/commit/87dff17b5c8a76010e09dff2d8e6dba55fb262a5))
* update document-model-libs version ([#100](https://github.com/powerhouse-inc/document-drive/issues/100)) ([0648328](https://github.com/powerhouse-inc/document-drive/commit/06483288af745f94aa9a81e526a03ae72197aa99))
* update updatedOperations instead of create ([f87691d](https://github.com/powerhouse-inc/document-drive/commit/f87691dadee45b08f357f5b9df7374bbf7dd39f1))
* updated document model dep ([37fa455](https://github.com/powerhouse-inc/document-drive/commit/37fa4556c44b000837bcb95673c90cf06af784c7))
* updated document model dep ([c9876dc](https://github.com/powerhouse-inc/document-drive/commit/c9876dc83462d80b1c4c4213f9aab6f791f60f61))
* updated document-model ([6d2eb8b](https://github.com/powerhouse-inc/document-drive/commit/6d2eb8b6eb35696b84d6dbe4586ec410ff5c61e6))
* updated document-model-libs dep ([44bced0](https://github.com/powerhouse-inc/document-drive/commit/44bced07a07d6f65f105f342c8b07f98b5f1bbc4))
* updated document-model-libs dep ([e73b813](https://github.com/powerhouse-inc/document-drive/commit/e73b81352899b1478512f2e9a50d61e534c6c360))
* updated IDocumentDriveServer type ([ea1d7b4](https://github.com/powerhouse-inc/document-drive/commit/ea1d7b4ad3b4804db398de6a5d7f60088bee3118))
* updated prisma schema with syncUnits and listeners ([224cbfe](https://github.com/powerhouse-inc/document-drive/commit/224cbfe51d97a2107ea114cc00a7a1665278f85c))
* use prisma transaction ([4a02fb8](https://github.com/powerhouse-inc/document-drive/commit/4a02fb8c7d2b93253c4cd7104318772e3b199b61))
* use reshuffleByTimestamp + added BasciClient + tests ([#129](https://github.com/powerhouse-inc/document-drive/issues/129)) ([8e0cfae](https://github.com/powerhouse-inc/document-drive/commit/8e0cfae5e0d2de52064689f023e4a80c170d8c84))
* use serializable transactions ([267cae4](https://github.com/powerhouse-inc/document-drive/commit/267cae47ba3fec4a4863169350cbf961172caebf))

# [1.0.0-experimental.5](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-experimental.4...v1.0.0-experimental.5) (2024-05-09)

### Features

-   updated IDocumentDriveServer type ([09dfbd4](https://github.com/powerhouse-inc/document-drive/commit/09dfbd41da5a805c842a69bedf168d5cff0976f0))

# [1.0.0-experimental.4](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-experimental.3...v1.0.0-experimental.4) (2024-05-08)

### Bug Fixes

-   add exports ([#157](https://github.com/powerhouse-inc/document-drive/issues/157)) ([59b5753](https://github.com/powerhouse-inc/document-drive/commit/59b57539216aea41f633c7a3f88cf93974c5f0e5))

# [1.0.0-experimental.3](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-experimental.2...v1.0.0-experimental.3) (2024-05-08)

### Bug Fixes

-   added exports ([412aced](https://github.com/powerhouse-inc/document-drive/commit/412acedb614750d6fe0ca23cdcff90e1003a99ad))

# [1.0.0-experimental.2](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-experimental.1...v1.0.0-experimental.2) (2024-05-08)

### Features

-   added operation queues with memory and redis adapters ([#139](https://github.com/powerhouse-inc/document-drive/issues/139)) ([7839cea](https://github.com/powerhouse-inc/document-drive/commit/7839ceadb666d2358a7e06167862c7f179b7ad5a)), closes [#154](https://github.com/powerhouse-inc/document-drive/issues/154)

# 1.0.0-experimental.1 (2024-05-07)

### Bug Fixes

-   acknowledge porper document ([c7abd01](https://github.com/powerhouse-inc/document-drive/commit/c7abd0138346b2482546a7a731b22be3e61c8ccd))
-   added name field to getDocument ([2cba21a](https://github.com/powerhouse-inc/document-drive/commit/2cba21aa6c4efcde50d8524f46dd22804b96f7d0))
-   apply auto lint ([803cf91](https://github.com/powerhouse-inc/document-drive/commit/803cf91b3c427dd9c6b1ef9a76c92a4cfa480fbd))
-   cast result of json parse ([83ee12b](https://github.com/powerhouse-inc/document-drive/commit/83ee12be711c74047eb7a4a86e235b7ab16e0a69))
-   delete drive handling ([6547274](https://github.com/powerhouse-inc/document-drive/commit/6547274d4ebe02e737aa429699af39fbabe2184b))
-   duplicate driv entry ([c89c27e](https://github.com/powerhouse-inc/document-drive/commit/c89c27e892a2b1d345cf5b28b00722f3cef88228))
-   generate drive Id if empty string ([9c5044c](https://github.com/powerhouse-inc/document-drive/commit/9c5044cb21b9f311b999ab60612e8e61991d0dad))
-   handle signals in sequence ([9660b08](https://github.com/powerhouse-inc/document-drive/commit/9660b089e554e570ff6312645b799e1af9e09596))
-   missing operations in return values ([6d6cf56](https://github.com/powerhouse-inc/document-drive/commit/6d6cf56426d75b41aad1df0e8735e2a3dcc34221))
-   operation data filter ([0e91f21](https://github.com/powerhouse-inc/document-drive/commit/0e91f2110a5942404b864199af8ebabd00112dea))
-   prisma schema ([bac17dd](https://github.com/powerhouse-inc/document-drive/commit/bac17ddd305788252529706c0c2e8b2207c64838))
-   remove react settings ([6e11865](https://github.com/powerhouse-inc/document-drive/commit/6e1186575de9a457add141fc916d6ea78fd066d5))
-   remove sentry ([75faf6a](https://github.com/powerhouse-inc/document-drive/commit/75faf6acff391bb2f5fac016190a481019a225ee))
-   reverse since change ([3e09362](https://github.com/powerhouse-inc/document-drive/commit/3e093623ca2f315e7faebeee3b3f3fc42bad083b))
-   semantic release ([94077da](https://github.com/powerhouse-inc/document-drive/commit/94077da1f383ee2bf1530af9a4f2749cbc8d4e89))
-   transmitter not found ([0fac28b](https://github.com/powerhouse-inc/document-drive/commit/0fac28b6f3de37b13899075c88fd37a9ce355013))
-   types ([37ebeca](https://github.com/powerhouse-inc/document-drive/commit/37ebeca0ff18a8f60c4604ace6ba17bad730f4cb))
-   update revision field if new operations are added ([45eb259](https://github.com/powerhouse-inc/document-drive/commit/45eb259b479655dde575835ce5c1aa6ad68a94f1))
-   wording issues ([fcbb994](https://github.com/powerhouse-inc/document-drive/commit/fcbb994d49eb035cdb9e553b104b6c8279b7fbef))

### Features

-   add ts-reset lib ([760c3fb](https://github.com/powerhouse-inc/document-drive/commit/760c3fbe685775be506835a1975541539c8fb862))
-   add unique constraint on operation index ([b058834](https://github.com/powerhouse-inc/document-drive/commit/b058834a8b48c2f6db971427e9633a91141c1079))
-   added .env.example ([c781094](https://github.com/powerhouse-inc/document-drive/commit/c781094ad7f7312efeee3e94695e809c5d4c6722))
-   added acknowledge function to pull responder ([e72a721](https://github.com/powerhouse-inc/document-drive/commit/e72a721713bb947b0ba93be1c38797e209865e5c))
-   added addAction methods and addInternalListener ([9a076b3](https://github.com/powerhouse-inc/document-drive/commit/9a076b3155060825d442351a2cd36d935a17ca44))
-   added basic implementation of push and pull transmitter ([1ffb004](https://github.com/powerhouse-inc/document-drive/commit/1ffb00443bf442a17e545f2451e9b399edfcc0d3))
-   added basic push strands implementatioN ([c858b75](https://github.com/powerhouse-inc/document-drive/commit/c858b7544365429ce4535a6c849cf785a5cafcd5))
-   added basic transmitters ([996ff0f](https://github.com/powerhouse-inc/document-drive/commit/996ff0f0c7ea212f1ed96ebc05690d0689bf3429))
-   added clearStorage support ([#82](https://github.com/powerhouse-inc/document-drive/issues/82)) ([323a93f](https://github.com/powerhouse-inc/document-drive/commit/323a93f0aaf1da1bd66b3b3292e35aefd92e9c5f))
-   added clipboard flag to operations table ([f6ce677](https://github.com/powerhouse-inc/document-drive/commit/f6ce677b5e3d723074a40bb834f4029cd1c13b9a))
-   added clipboard to document ([3f8c295](https://github.com/powerhouse-inc/document-drive/commit/3f8c29573cbd08f071492b56f4b31f688af7c9db))
-   added debug and trace methods and logger export ([c7336de](https://github.com/powerhouse-inc/document-drive/commit/c7336de1f4b0e55a4c8d4e5efe5b063c7a4ccc88))
-   added document cache ([deae523](https://github.com/powerhouse-inc/document-drive/commit/deae523851b98fcd250825a4b2918b364525660f))
-   added drive events and improved sync error handling ([647c833](https://github.com/powerhouse-inc/document-drive/commit/647c8339b2166767c240a286d9ea12b032695417))
-   added duplicate folders id tests ([#143](https://github.com/powerhouse-inc/document-drive/issues/143)) ([abd3688](https://github.com/powerhouse-inc/document-drive/commit/abd3688bb284257a8f088e905e1f7cf6de1f8f5d))
-   added experimental release ([#155](https://github.com/powerhouse-inc/document-drive/issues/155)) ([adc52a5](https://github.com/powerhouse-inc/document-drive/commit/adc52a56655ef97de588cb03b6922ab69e72a8e9))
-   added exponential retry backoff to prisma transactions ([b38e72f](https://github.com/powerhouse-inc/document-drive/commit/b38e72fdfd29f4c39e15f606fccc942ec966fffe))
-   added getDrive by slug to memory adapter ([5515c34](https://github.com/powerhouse-inc/document-drive/commit/5515c34ecc18a6f14931a1a66cee454f14dbe03f))
-   added getDriveBySlug ([680cf71](https://github.com/powerhouse-inc/document-drive/commit/680cf71209853689e1414f90f58f079460be94d5))
-   added graphql requests for pull responder ([6578bae](https://github.com/powerhouse-inc/document-drive/commit/6578bae242a0c625531ac8b9bdec4c51727f57e6))
-   added init of pullResponder ([3961916](https://github.com/powerhouse-inc/document-drive/commit/3961916bbb780c0555d3d7e106ab25c80e988c7b))
-   added internal transmitter ([d728aed](https://github.com/powerhouse-inc/document-drive/commit/d728aed8ae692a83a0b998ccd6d7e36496e08b95))
-   added internal transmitter service ([6863620](https://github.com/powerhouse-inc/document-drive/commit/68636202d5bfd081ef979263fd697086529a1d10))
-   added listener functions ([6bc1803](https://github.com/powerhouse-inc/document-drive/commit/6bc180358826adf8a0ce6f247df37d8de245d8e7))
-   added namespace option for browser storage ([2fb312a](https://github.com/powerhouse-inc/document-drive/commit/2fb312a020d6593157c401814e0327d260f64718))
-   added prisma connection ([ef87ca7](https://github.com/powerhouse-inc/document-drive/commit/ef87ca7681c4336a68f15ecf35906cdfc9c8aa0a))
-   added registerListener function to PullResponderTransmitter ([814c160](https://github.com/powerhouse-inc/document-drive/commit/814c1603ef011402db30f373c3b5fbb2d3f12c58))
-   added retry mechanism to transaction ([e01a2cb](https://github.com/powerhouse-inc/document-drive/commit/e01a2cb6e1c64d37655255191fc4af13254201fe))
-   added semantic release ([f1c31a6](https://github.com/powerhouse-inc/document-drive/commit/f1c31a6bd2012ac6d51a7a3a5b94f656887e6b5a))
-   added sequelize adapter ([#19](https://github.com/powerhouse-inc/document-drive/issues/19)) ([71529d8](https://github.com/powerhouse-inc/document-drive/commit/71529d8d60eb6ff0390bdebb1bb660fb680c99f3))
-   added strandUpdate events ([1143716](https://github.com/powerhouse-inc/document-drive/commit/11437161fd1b0b0f37a7ef50833022507e4699f3))
-   added support for update noop operations ([#42](https://github.com/powerhouse-inc/document-drive/issues/42)) ([c59e15a](https://github.com/powerhouse-inc/document-drive/commit/c59e15a69f08f2abe654ce15c090f1212aee7606))
-   added update operations in prisma storage addDocumentOperations ([#71](https://github.com/powerhouse-inc/document-drive/issues/71)) ([eeb96af](https://github.com/powerhouse-inc/document-drive/commit/eeb96afbad520f90ce8c9b71bf573950dadadf4b))
-   added winston as default logger ([77c2451](https://github.com/powerhouse-inc/document-drive/commit/77c2451e4ceaddb11dd378a89f89c4245db51cb0))
-   also transmit scope state on internal transmitters ([c75a5d5](https://github.com/powerhouse-inc/document-drive/commit/c75a5d5b01ddaf166f0d86cd0afab4f888757a17))
-   avoid duplicating sync units on listener manager ([ad9a015](https://github.com/powerhouse-inc/document-drive/commit/ad9a015d8b50ba444362b85b1f57b9349037c325))
-   bug fixing ([1bb6097](https://github.com/powerhouse-inc/document-drive/commit/1bb60972588b5b95d2bb52354d8b35319d21eed5))
-   bump document-model dep ([7442070](https://github.com/powerhouse-inc/document-drive/commit/744207006dad191e214f0547d78d185530476560))
-   bump libs ([8b18624](https://github.com/powerhouse-inc/document-drive/commit/8b18624c05792d086b31a0b42b99cf42f3dc0627))
-   bump lint deps ([c4a68c9](https://github.com/powerhouse-inc/document-drive/commit/c4a68c9d1c8fea85d85d18eebf66a53d57438dbd))
-   cache updated document as soon as possible ([0b3327c](https://github.com/powerhouse-inc/document-drive/commit/0b3327cea01b508e0c07f05dee7fdcb4a6aaea35))
-   change unimportant rules to warn ([3958150](https://github.com/powerhouse-inc/document-drive/commit/395815033e8fe5e937342b5b2ba1d57ba64cbc8d))
-   check if there are conflicting operations when storing operations ([2487ab1](https://github.com/powerhouse-inc/document-drive/commit/2487ab10017ab819c560a115409829027dad9fda))
-   continue initializing remaining drives if one fails ([5cd9962](https://github.com/powerhouse-inc/document-drive/commit/5cd9962785e399aa5eb06f2b87a97fed72b51178))
-   defined types and functions ([0b57ae9](https://github.com/powerhouse-inc/document-drive/commit/0b57ae969f023f06ffc4859d1f8f514ef7a2508f))
-   delay sync updates after receiving strands ([e1d3a87](https://github.com/powerhouse-inc/document-drive/commit/e1d3a871a99042d397b7c7928432028251fba55d))
-   delete sync units before removing document ([6b54e1d](https://github.com/powerhouse-inc/document-drive/commit/6b54e1dfb7249c0c6e061e916783ac92cb5d1481))
-   do not consider already skipped operations when adding operations to document ([0778863](https://github.com/powerhouse-inc/document-drive/commit/077886351a1dbde484331a30778fa4daf12cf2a2))
-   don't send operation with index equal to fromRevision ([f279046](https://github.com/powerhouse-inc/document-drive/commit/f279046f156c3b9c35c1c7cdd950319078f09e04))
-   emit missing operation error ([8250681](https://github.com/powerhouse-inc/document-drive/commit/82506819148565aa6a7034b8e4a6d27ec9d3a0a3))
-   emit single sync status event for multiple strands ([1b9cf53](https://github.com/powerhouse-inc/document-drive/commit/1b9cf5313cca31f696c104b169d1210a3c2b829f))
-   emit sync events when updating listeners ([b1899bb](https://github.com/powerhouse-inc/document-drive/commit/b1899bbe6a3d555fc6ea5236c55b1417def11ec2))
-   filter out drive strand if filter excludes it ([a6d3cd2](https://github.com/powerhouse-inc/document-drive/commit/a6d3cd25e63c917cf0033429ab75d265e76bde32))
-   fix filter operations with since timestamp ([8a19d30](https://github.com/powerhouse-inc/document-drive/commit/8a19d30f892a9862be15c670d8114f4493198245))
-   fixed array access error ([ed1a3a9](https://github.com/powerhouse-inc/document-drive/commit/ed1a3a953a0a52d629eb8a69f83ce18b976076af))
-   fixed date comparison ([6d28a3b](https://github.com/powerhouse-inc/document-drive/commit/6d28a3bfd6b338deaa5ede718b7a9ebc0cccf498))
-   fixed state on internal transmitter strand ([5dbe930](https://github.com/powerhouse-inc/document-drive/commit/5dbe930af551375117d36f9b4d36fd613de8d9f7))
-   fixed unit tests ([46edd15](https://github.com/powerhouse-inc/document-drive/commit/46edd150aa4deb8814b4d1e6bd41b13e42b6ae91))
-   force deploy ([#126](https://github.com/powerhouse-inc/document-drive/issues/126)) ([e02d22e](https://github.com/powerhouse-inc/document-drive/commit/e02d22ee00471f3f20544cc27155108143d22512))
-   get drive by id or slug ([95c171e](https://github.com/powerhouse-inc/document-drive/commit/95c171e97eb7e27a65129d7fc400fae862d62fdc))
-   implementation of switchboard transmitter ([cfbdc85](https://github.com/powerhouse-inc/document-drive/commit/cfbdc8570dfc86b6fe949c5246b240c634917a99))
-   implemented operation validation for document operations ([39bedf4](https://github.com/powerhouse-inc/document-drive/commit/39bedf43d2a3b1fda51d82f26b7f92b93a7cce5b))
-   improve add operations insert statement ([1c238ce](https://github.com/powerhouse-inc/document-drive/commit/1c238cef779e62bf89d2341a05a3af3633b9ec59))
-   improved error reporting and fixed operation hash check ([c6cc70f](https://github.com/powerhouse-inc/document-drive/commit/c6cc70f627dbdd2eab6399543fd41544fb959506))
-   improved operation errors ([a05772d](https://github.com/powerhouse-inc/document-drive/commit/a05772d023c600dd85d50be65f1ee80b19d546ef))
-   init listener manager ([0edb539](https://github.com/powerhouse-inc/document-drive/commit/0edb53988f691672a3c3e0ce3179142bc09b6b58))
-   initial work on tests migration ([3046dc1](https://github.com/powerhouse-inc/document-drive/commit/3046dc16a0405476a0af22aaf605be6ce43bf4c5))
-   instantiate listeners on server initialization ([367396d](https://github.com/powerhouse-inc/document-drive/commit/367396d8205b6ba81f7c4261d516be2eebfb664e))
-   integrated append only conflict resolution ([#153](https://github.com/powerhouse-inc/document-drive/issues/153)) ([5ecb264](https://github.com/powerhouse-inc/document-drive/commit/5ecb264ec6a4804653ff81d213c42d5e8cfb341b))
-   only add listeners once ([12ca458](https://github.com/powerhouse-inc/document-drive/commit/12ca458ce9a4b5577fc45c5a8bcca5d905bd80ee))
-   only emit event when syncStatus changes ([1cedf61](https://github.com/powerhouse-inc/document-drive/commit/1cedf6110fead2410a61d0d8f261a57d11c48fa1))
-   proceed with loop only after previous request is done ([d7eec70](https://github.com/powerhouse-inc/document-drive/commit/d7eec7044233c060c56e98698360070198a540dd))
-   replaced winston with console ([bbb7fc5](https://github.com/powerhouse-inc/document-drive/commit/bbb7fc53fa8cb5da97c6068e95ab77d5149d87fc))
-   run pull loop immediately for the first time ([802a126](https://github.com/powerhouse-inc/document-drive/commit/802a126e4ec90b5b62ad3e228cee73daa06cf651))
-   set sync status success if no new strands ([7a9627c](https://github.com/powerhouse-inc/document-drive/commit/7a9627cd72c80ae3c56a933bcd92c3da87529e00))
-   skip hash generation when replaying documents ([697ea35](https://github.com/powerhouse-inc/document-drive/commit/697ea35ae79a6697c8bfd4810a8d28139bf1a01f))
-   stop drive sync if triggers are removed ([dcf2df2](https://github.com/powerhouse-inc/document-drive/commit/dcf2df256f43f234bfb9188c750521fb57df880f))
-   store and sync operation context ([b2e5d5e](https://github.com/powerhouse-inc/document-drive/commit/b2e5d5efe59ed382fe6f984c193959218cbac4e0))
-   sync protocol draft ([f5ef843](https://github.com/powerhouse-inc/document-drive/commit/f5ef8436f9dfa50b546c77363bc8edfb887d671c))
-   trigger release ([a99370f](https://github.com/powerhouse-inc/document-drive/commit/a99370fbfea65bbc20f3fc3c39f0a26087795603))
-   trigger release ([75d8cc7](https://github.com/powerhouse-inc/document-drive/commit/75d8cc73c7022ecb6c71945486539e3b61ad9e1d))
-   trigger release ([33209d5](https://github.com/powerhouse-inc/document-drive/commit/33209d59cf4f44946b524a88c9008fef40aceea9))
-   update config ([c0197a6](https://github.com/powerhouse-inc/document-drive/commit/c0197a6bd86cdb706883e9cd7f0cad017fa115de))
-   update document-model and document-model-libs ([#145](https://github.com/powerhouse-inc/document-drive/issues/145)) ([87dff17](https://github.com/powerhouse-inc/document-drive/commit/87dff17b5c8a76010e09dff2d8e6dba55fb262a5))
-   update document-model-libs version ([#100](https://github.com/powerhouse-inc/document-drive/issues/100)) ([0648328](https://github.com/powerhouse-inc/document-drive/commit/06483288af745f94aa9a81e526a03ae72197aa99))
-   update updatedOperations instead of create ([f87691d](https://github.com/powerhouse-inc/document-drive/commit/f87691dadee45b08f357f5b9df7374bbf7dd39f1))
-   updated document model dep ([37fa455](https://github.com/powerhouse-inc/document-drive/commit/37fa4556c44b000837bcb95673c90cf06af784c7))
-   updated document model dep ([c9876dc](https://github.com/powerhouse-inc/document-drive/commit/c9876dc83462d80b1c4c4213f9aab6f791f60f61))
-   updated document-model ([6d2eb8b](https://github.com/powerhouse-inc/document-drive/commit/6d2eb8b6eb35696b84d6dbe4586ec410ff5c61e6))
-   updated document-model-libs dep ([44bced0](https://github.com/powerhouse-inc/document-drive/commit/44bced07a07d6f65f105f342c8b07f98b5f1bbc4))
-   updated document-model-libs dep ([e73b813](https://github.com/powerhouse-inc/document-drive/commit/e73b81352899b1478512f2e9a50d61e534c6c360))
-   updated prisma schema with syncUnits and listeners ([224cbfe](https://github.com/powerhouse-inc/document-drive/commit/224cbfe51d97a2107ea114cc00a7a1665278f85c))
-   use prisma transaction ([4a02fb8](https://github.com/powerhouse-inc/document-drive/commit/4a02fb8c7d2b93253c4cd7104318772e3b199b61))
-   use reshuffleByTimestamp + added BasciClient + tests ([#129](https://github.com/powerhouse-inc/document-drive/issues/129)) ([8e0cfae](https://github.com/powerhouse-inc/document-drive/commit/8e0cfae5e0d2de52064689f023e4a80c170d8c84))
-   use serializable transactions ([267cae4](https://github.com/powerhouse-inc/document-drive/commit/267cae47ba3fec4a4863169350cbf961172caebf))

# [1.0.0-alpha.54](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.53...v1.0.0-alpha.54) (2024-05-07)

### Features

-   added experimental release ([#155](https://github.com/powerhouse-inc/document-drive/issues/155)) ([adc52a5](https://github.com/powerhouse-inc/document-drive/commit/adc52a56655ef97de588cb03b6922ab69e72a8e9))

# [1.0.0-alpha.53](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.52...v1.0.0-alpha.53) (2024-04-30)

### Features

-   added getDrive by slug to memory adapter ([5515c34](https://github.com/powerhouse-inc/document-drive/commit/5515c34ecc18a6f14931a1a66cee454f14dbe03f))
-   added getDriveBySlug ([680cf71](https://github.com/powerhouse-inc/document-drive/commit/680cf71209853689e1414f90f58f079460be94d5))
-   get drive by id or slug ([95c171e](https://github.com/powerhouse-inc/document-drive/commit/95c171e97eb7e27a65129d7fc400fae862d62fdc))

# [1.0.0-alpha.52](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.51...v1.0.0-alpha.52) (2024-04-24)

### Features

-   store and sync operation context ([b2e5d5e](https://github.com/powerhouse-inc/document-drive/commit/b2e5d5efe59ed382fe6f984c193959218cbac4e0))

# [1.0.0-alpha.51](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.50...v1.0.0-alpha.51) (2024-04-24)

### Features

-   added exponential retry backoff to prisma transactions ([b38e72f](https://github.com/powerhouse-inc/document-drive/commit/b38e72fdfd29f4c39e15f606fccc942ec966fffe))

# [1.0.0-alpha.50](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.49...v1.0.0-alpha.50) (2024-04-23)

### Features

-   update document-model and document-model-libs ([#145](https://github.com/powerhouse-inc/document-drive/issues/145)) ([87dff17](https://github.com/powerhouse-inc/document-drive/commit/87dff17b5c8a76010e09dff2d8e6dba55fb262a5))

# [1.0.0-alpha.49](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.48...v1.0.0-alpha.49) (2024-04-23)

### Features

-   added duplicate folders id tests ([#143](https://github.com/powerhouse-inc/document-drive/issues/143)) ([abd3688](https://github.com/powerhouse-inc/document-drive/commit/abd3688bb284257a8f088e905e1f7cf6de1f8f5d))

# [1.0.0-alpha.48](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.47...v1.0.0-alpha.48) (2024-04-23)

### Features

-   added retry mechanism to transaction ([e01a2cb](https://github.com/powerhouse-inc/document-drive/commit/e01a2cb6e1c64d37655255191fc4af13254201fe))

# [1.0.0-alpha.47](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.46...v1.0.0-alpha.47) (2024-04-23)

### Features

-   use serializable transactions ([267cae4](https://github.com/powerhouse-inc/document-drive/commit/267cae47ba3fec4a4863169350cbf961172caebf))

# [1.0.0-alpha.46](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.45...v1.0.0-alpha.46) (2024-04-23)

### Features

-   do not consider already skipped operations when adding operations to document ([0778863](https://github.com/powerhouse-inc/document-drive/commit/077886351a1dbde484331a30778fa4daf12cf2a2))

# [1.0.0-alpha.45](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.44...v1.0.0-alpha.45) (2024-04-22)

### Features

-   continue initializing remaining drives if one fails ([5cd9962](https://github.com/powerhouse-inc/document-drive/commit/5cd9962785e399aa5eb06f2b87a97fed72b51178))

# [1.0.0-alpha.44](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.43...v1.0.0-alpha.44) (2024-04-22)

### Features

-   cache updated document as soon as possible ([0b3327c](https://github.com/powerhouse-inc/document-drive/commit/0b3327cea01b508e0c07f05dee7fdcb4a6aaea35))

# [1.0.0-alpha.43](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.42...v1.0.0-alpha.43) (2024-04-19)

### Features

-   fixed array access error ([ed1a3a9](https://github.com/powerhouse-inc/document-drive/commit/ed1a3a953a0a52d629eb8a69f83ce18b976076af))

# [1.0.0-alpha.42](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.41...v1.0.0-alpha.42) (2024-04-19)

### Features

-   trigger release ([a99370f](https://github.com/powerhouse-inc/document-drive/commit/a99370fbfea65bbc20f3fc3c39f0a26087795603))

# [1.0.0-alpha.41](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.40...v1.0.0-alpha.41) (2024-04-18)

### Features

-   updated document-model ([6d2eb8b](https://github.com/powerhouse-inc/document-drive/commit/6d2eb8b6eb35696b84d6dbe4586ec410ff5c61e6))

# [1.0.0-alpha.40](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.39...v1.0.0-alpha.40) (2024-04-18)

### Features

-   skip hash generation when replaying documents ([697ea35](https://github.com/powerhouse-inc/document-drive/commit/697ea35ae79a6697c8bfd4810a8d28139bf1a01f))

# [1.0.0-alpha.39](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.38...v1.0.0-alpha.39) (2024-04-18)

### Features

-   trigger release ([75d8cc7](https://github.com/powerhouse-inc/document-drive/commit/75d8cc73c7022ecb6c71945486539e3b61ad9e1d))

# [1.0.0-alpha.38](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.37...v1.0.0-alpha.38) (2024-04-17)

### Bug Fixes

-   types ([37ebeca](https://github.com/powerhouse-inc/document-drive/commit/37ebeca0ff18a8f60c4604ace6ba17bad730f4cb))

### Features

-   added document cache ([deae523](https://github.com/powerhouse-inc/document-drive/commit/deae523851b98fcd250825a4b2918b364525660f))

# [1.0.0-alpha.37](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.36...v1.0.0-alpha.37) (2024-04-17)

### Features

-   fixed unit tests ([46edd15](https://github.com/powerhouse-inc/document-drive/commit/46edd150aa4deb8814b4d1e6bd41b13e42b6ae91))
-   initial work on tests migration ([3046dc1](https://github.com/powerhouse-inc/document-drive/commit/3046dc16a0405476a0af22aaf605be6ce43bf4c5))

# [1.0.0-alpha.36](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.35...v1.0.0-alpha.36) (2024-04-16)

### Features

-   added namespace option for browser storage ([2fb312a](https://github.com/powerhouse-inc/document-drive/commit/2fb312a020d6593157c401814e0327d260f64718))

# [1.0.0-alpha.35](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.34...v1.0.0-alpha.35) (2024-04-16)

### Features

-   use reshuffleByTimestamp + added BasciClient + tests ([#129](https://github.com/powerhouse-inc/document-drive/issues/129)) ([8e0cfae](https://github.com/powerhouse-inc/document-drive/commit/8e0cfae5e0d2de52064689f023e4a80c170d8c84))

# [1.0.0-alpha.34](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.33...v1.0.0-alpha.34) (2024-04-12)

### Features

-   force deploy ([#126](https://github.com/powerhouse-inc/document-drive/issues/126)) ([e02d22e](https://github.com/powerhouse-inc/document-drive/commit/e02d22ee00471f3f20544cc27155108143d22512))

# [1.0.0-alpha.33](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.32...v1.0.0-alpha.33) (2024-04-11)

### Features

-   added debug and trace methods and logger export ([c7336de](https://github.com/powerhouse-inc/document-drive/commit/c7336de1f4b0e55a4c8d4e5efe5b063c7a4ccc88))

# [1.0.0-alpha.32](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.31...v1.0.0-alpha.32) (2024-04-11)

### Features

-   replaced winston with console ([bbb7fc5](https://github.com/powerhouse-inc/document-drive/commit/bbb7fc53fa8cb5da97c6068e95ab77d5149d87fc))

# [1.0.0-alpha.31](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.30...v1.0.0-alpha.31) (2024-04-10)

### Bug Fixes

-   remove sentry ([75faf6a](https://github.com/powerhouse-inc/document-drive/commit/75faf6acff391bb2f5fac016190a481019a225ee))

# [1.0.0-alpha.30](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.29...v1.0.0-alpha.30) (2024-04-10)

### Bug Fixes

-   delete drive handling ([6547274](https://github.com/powerhouse-inc/document-drive/commit/6547274d4ebe02e737aa429699af39fbabe2184b))

# [1.0.0-alpha.29](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.28...v1.0.0-alpha.29) (2024-04-10)

### Features

-   added winston as default logger ([77c2451](https://github.com/powerhouse-inc/document-drive/commit/77c2451e4ceaddb11dd378a89f89c4245db51cb0))

# [1.0.0-alpha.28](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.27...v1.0.0-alpha.28) (2024-04-05)

### Features

-   avoid duplicating sync units on listener manager ([ad9a015](https://github.com/powerhouse-inc/document-drive/commit/ad9a015d8b50ba444362b85b1f57b9349037c325))
-   delay sync updates after receiving strands ([e1d3a87](https://github.com/powerhouse-inc/document-drive/commit/e1d3a871a99042d397b7c7928432028251fba55d))

# [1.0.0-alpha.27](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.26...v1.0.0-alpha.27) (2024-04-03)

### Features

-   updated document-model-libs dep ([44bced0](https://github.com/powerhouse-inc/document-drive/commit/44bced07a07d6f65f105f342c8b07f98b5f1bbc4))
-   updated document-model-libs dep ([e73b813](https://github.com/powerhouse-inc/document-drive/commit/e73b81352899b1478512f2e9a50d61e534c6c360))

# [1.0.0-alpha.26](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.25...v1.0.0-alpha.26) (2024-04-03)

### Features

-   only add listeners once ([12ca458](https://github.com/powerhouse-inc/document-drive/commit/12ca458ce9a4b5577fc45c5a8bcca5d905bd80ee))

# [1.0.0-alpha.25](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.24...v1.0.0-alpha.25) (2024-04-02)

### Features

-   update updatedOperations instead of create ([f87691d](https://github.com/powerhouse-inc/document-drive/commit/f87691dadee45b08f357f5b9df7374bbf7dd39f1))
-   use prisma transaction ([4a02fb8](https://github.com/powerhouse-inc/document-drive/commit/4a02fb8c7d2b93253c4cd7104318772e3b199b61))

# [1.0.0-alpha.24](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.23...v1.0.0-alpha.24) (2024-04-01)

### Features

-   add unique constraint on operation index ([b058834](https://github.com/powerhouse-inc/document-drive/commit/b058834a8b48c2f6db971427e9633a91141c1079))
-   check if there are conflicting operations when storing operations ([2487ab1](https://github.com/powerhouse-inc/document-drive/commit/2487ab10017ab819c560a115409829027dad9fda))

# [1.0.0-alpha.23](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.22...v1.0.0-alpha.23) (2024-03-29)

### Bug Fixes

-   generate drive Id if empty string ([9c5044c](https://github.com/powerhouse-inc/document-drive/commit/9c5044cb21b9f311b999ab60612e8e61991d0dad))

# [1.0.0-alpha.22](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.21...v1.0.0-alpha.22) (2024-03-29)

### Features

-   emit missing operation error ([8250681](https://github.com/powerhouse-inc/document-drive/commit/82506819148565aa6a7034b8e4a6d27ec9d3a0a3))

# [1.0.0-alpha.21](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.20...v1.0.0-alpha.21) (2024-03-29)

### Features

-   update document-model-libs version ([#100](https://github.com/powerhouse-inc/document-drive/issues/100)) ([0648328](https://github.com/powerhouse-inc/document-drive/commit/06483288af745f94aa9a81e526a03ae72197aa99))

# [1.0.0-alpha.20](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.19...v1.0.0-alpha.20) (2024-03-28)

### Features

-   updated document model dep ([37fa455](https://github.com/powerhouse-inc/document-drive/commit/37fa4556c44b000837bcb95673c90cf06af784c7))

# [1.0.0-alpha.19](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.18...v1.0.0-alpha.19) (2024-03-28)

### Features

-   updated document model dep ([c9876dc](https://github.com/powerhouse-inc/document-drive/commit/c9876dc83462d80b1c4c4213f9aab6f791f60f61))

# [1.0.0-alpha.18](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.17...v1.0.0-alpha.18) (2024-03-27)

### Features

-   only emit event when syncStatus changes ([1cedf61](https://github.com/powerhouse-inc/document-drive/commit/1cedf6110fead2410a61d0d8f261a57d11c48fa1))

# [1.0.0-alpha.17](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.16...v1.0.0-alpha.17) (2024-03-06)

### Features

-   added clearStorage support ([#82](https://github.com/powerhouse-inc/document-drive/issues/82)) ([323a93f](https://github.com/powerhouse-inc/document-drive/commit/323a93f0aaf1da1bd66b3b3292e35aefd92e9c5f))

# [1.0.0-alpha.16](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.15...v1.0.0-alpha.16) (2024-03-04)

### Features

-   fixed state on internal transmitter strand ([5dbe930](https://github.com/powerhouse-inc/document-drive/commit/5dbe930af551375117d36f9b4d36fd613de8d9f7))

# [1.0.0-alpha.15](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.14...v1.0.0-alpha.15) (2024-03-04)

### Features

-   instantiate listeners on server initialization ([367396d](https://github.com/powerhouse-inc/document-drive/commit/367396d8205b6ba81f7c4261d516be2eebfb664e))

# [1.0.0-alpha.14](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.13...v1.0.0-alpha.14) (2024-02-29)

### Features

-   added addAction methods and addInternalListener ([9a076b3](https://github.com/powerhouse-inc/document-drive/commit/9a076b3155060825d442351a2cd36d935a17ca44))
-   also transmit scope state on internal transmitters ([c75a5d5](https://github.com/powerhouse-inc/document-drive/commit/c75a5d5b01ddaf166f0d86cd0afab4f888757a17))

# [1.0.0-alpha.13](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.12...v1.0.0-alpha.13) (2024-02-28)

### Bug Fixes

-   wording issues ([fcbb994](https://github.com/powerhouse-inc/document-drive/commit/fcbb994d49eb035cdb9e553b104b6c8279b7fbef))

### Features

-   added internal transmitter ([d728aed](https://github.com/powerhouse-inc/document-drive/commit/d728aed8ae692a83a0b998ccd6d7e36496e08b95))

# [1.0.0-alpha.12](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.11...v1.0.0-alpha.12) (2024-02-26)

### Features

-   stop drive sync if triggers are removed ([dcf2df2](https://github.com/powerhouse-inc/document-drive/commit/dcf2df256f43f234bfb9188c750521fb57df880f))

# [1.0.0-alpha.11](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.10...v1.0.0-alpha.11) (2024-02-22)

### Features

-   filter out drive strand if filter excludes it ([a6d3cd2](https://github.com/powerhouse-inc/document-drive/commit/a6d3cd25e63c917cf0033429ab75d265e76bde32))

# [1.0.0-alpha.10](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.9...v1.0.0-alpha.10) (2024-02-21)

### Features

-   improve add operations insert statement ([1c238ce](https://github.com/powerhouse-inc/document-drive/commit/1c238cef779e62bf89d2341a05a3af3633b9ec59))

# [1.0.0-alpha.9](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.8...v1.0.0-alpha.9) (2024-02-21)

### Features

-   added update operations in prisma storage addDocumentOperations ([#71](https://github.com/powerhouse-inc/document-drive/issues/71)) ([eeb96af](https://github.com/powerhouse-inc/document-drive/commit/eeb96afbad520f90ce8c9b71bf573950dadadf4b))

# [1.0.0-alpha.8](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.7...v1.0.0-alpha.8) (2024-02-21)

### Features

-   set sync status success if no new strands ([7a9627c](https://github.com/powerhouse-inc/document-drive/commit/7a9627cd72c80ae3c56a933bcd92c3da87529e00))

# [1.0.0-alpha.7](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.6...v1.0.0-alpha.7) (2024-02-20)

### Features

-   fixed date comparison ([6d28a3b](https://github.com/powerhouse-inc/document-drive/commit/6d28a3bfd6b338deaa5ede718b7a9ebc0cccf498))

# [1.0.0-alpha.6](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.5...v1.0.0-alpha.6) (2024-02-20)

### Bug Fixes

-   reverse since change ([3e09362](https://github.com/powerhouse-inc/document-drive/commit/3e093623ca2f315e7faebeee3b3f3fc42bad083b))

# [1.0.0-alpha.5](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.4...v1.0.0-alpha.5) (2024-02-20)

### Features

-   trigger release ([33209d5](https://github.com/powerhouse-inc/document-drive/commit/33209d59cf4f44946b524a88c9008fef40aceea9))

# [1.0.0-alpha.4](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.3...v1.0.0-alpha.4) (2024-02-20)

### Features

-   fix filter operations with since timestamp ([8a19d30](https://github.com/powerhouse-inc/document-drive/commit/8a19d30f892a9862be15c670d8114f4493198245))

# [1.0.0-alpha.3](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.2...v1.0.0-alpha.3) (2024-02-20)

### Features

-   bump document-model dep ([7442070](https://github.com/powerhouse-inc/document-drive/commit/744207006dad191e214f0547d78d185530476560))

# [1.0.0-alpha.2](https://github.com/powerhouse-inc/document-drive/compare/v1.0.0-alpha.1...v1.0.0-alpha.2) (2024-02-20)

### Features

-   emit single sync status event for multiple strands ([1b9cf53](https://github.com/powerhouse-inc/document-drive/commit/1b9cf5313cca31f696c104b169d1210a3c2b829f))
-   improved error reporting and fixed operation hash check ([c6cc70f](https://github.com/powerhouse-inc/document-drive/commit/c6cc70f627dbdd2eab6399543fd41544fb959506))
-   proceed with loop only after previous request is done ([d7eec70](https://github.com/powerhouse-inc/document-drive/commit/d7eec7044233c060c56e98698360070198a540dd))

# 1.0.0-alpha.1 (2024-02-16)

### Bug Fixes

-   acknowledge porper document ([c7abd01](https://github.com/powerhouse-inc/document-drive/commit/c7abd0138346b2482546a7a731b22be3e61c8ccd))
-   added name field to getDocument ([2cba21a](https://github.com/powerhouse-inc/document-drive/commit/2cba21aa6c4efcde50d8524f46dd22804b96f7d0))
-   apply auto lint ([803cf91](https://github.com/powerhouse-inc/document-drive/commit/803cf91b3c427dd9c6b1ef9a76c92a4cfa480fbd))
-   cast result of json parse ([83ee12b](https://github.com/powerhouse-inc/document-drive/commit/83ee12be711c74047eb7a4a86e235b7ab16e0a69))
-   duplicate driv entry ([c89c27e](https://github.com/powerhouse-inc/document-drive/commit/c89c27e892a2b1d345cf5b28b00722f3cef88228))
-   handle signals in sequence ([9660b08](https://github.com/powerhouse-inc/document-drive/commit/9660b089e554e570ff6312645b799e1af9e09596))
-   missing operations in return values ([6d6cf56](https://github.com/powerhouse-inc/document-drive/commit/6d6cf56426d75b41aad1df0e8735e2a3dcc34221))
-   operation data filter ([0e91f21](https://github.com/powerhouse-inc/document-drive/commit/0e91f2110a5942404b864199af8ebabd00112dea))
-   prisma schema ([bac17dd](https://github.com/powerhouse-inc/document-drive/commit/bac17ddd305788252529706c0c2e8b2207c64838))
-   remove react settings ([6e11865](https://github.com/powerhouse-inc/document-drive/commit/6e1186575de9a457add141fc916d6ea78fd066d5))
-   semantic release ([94077da](https://github.com/powerhouse-inc/document-drive/commit/94077da1f383ee2bf1530af9a4f2749cbc8d4e89))
-   transmitter not found ([0fac28b](https://github.com/powerhouse-inc/document-drive/commit/0fac28b6f3de37b13899075c88fd37a9ce355013))
-   update revision field if new operations are added ([45eb259](https://github.com/powerhouse-inc/document-drive/commit/45eb259b479655dde575835ce5c1aa6ad68a94f1))

### Features

-   add ts-reset lib ([760c3fb](https://github.com/powerhouse-inc/document-drive/commit/760c3fbe685775be506835a1975541539c8fb862))
-   added .env.example ([c781094](https://github.com/powerhouse-inc/document-drive/commit/c781094ad7f7312efeee3e94695e809c5d4c6722))
-   added acknowledge function to pull responder ([e72a721](https://github.com/powerhouse-inc/document-drive/commit/e72a721713bb947b0ba93be1c38797e209865e5c))
-   added basic implementation of push and pull transmitter ([1ffb004](https://github.com/powerhouse-inc/document-drive/commit/1ffb00443bf442a17e545f2451e9b399edfcc0d3))
-   added basic push strands implementatioN ([c858b75](https://github.com/powerhouse-inc/document-drive/commit/c858b7544365429ce4535a6c849cf785a5cafcd5))
-   added basic transmitters ([996ff0f](https://github.com/powerhouse-inc/document-drive/commit/996ff0f0c7ea212f1ed96ebc05690d0689bf3429))
-   added clipboard flag to operations table ([f6ce677](https://github.com/powerhouse-inc/document-drive/commit/f6ce677b5e3d723074a40bb834f4029cd1c13b9a))
-   added clipboard to document ([3f8c295](https://github.com/powerhouse-inc/document-drive/commit/3f8c29573cbd08f071492b56f4b31f688af7c9db))
-   added drive events and improved sync error handling ([647c833](https://github.com/powerhouse-inc/document-drive/commit/647c8339b2166767c240a286d9ea12b032695417))
-   added graphql requests for pull responder ([6578bae](https://github.com/powerhouse-inc/document-drive/commit/6578bae242a0c625531ac8b9bdec4c51727f57e6))
-   added init of pullResponder ([3961916](https://github.com/powerhouse-inc/document-drive/commit/3961916bbb780c0555d3d7e106ab25c80e988c7b))
-   added internal transmitter service ([6863620](https://github.com/powerhouse-inc/document-drive/commit/68636202d5bfd081ef979263fd697086529a1d10))
-   added listener functions ([6bc1803](https://github.com/powerhouse-inc/document-drive/commit/6bc180358826adf8a0ce6f247df37d8de245d8e7))
-   added prisma connection ([ef87ca7](https://github.com/powerhouse-inc/document-drive/commit/ef87ca7681c4336a68f15ecf35906cdfc9c8aa0a))
-   added registerListener function to PullResponderTransmitter ([814c160](https://github.com/powerhouse-inc/document-drive/commit/814c1603ef011402db30f373c3b5fbb2d3f12c58))
-   added semantic release ([f1c31a6](https://github.com/powerhouse-inc/document-drive/commit/f1c31a6bd2012ac6d51a7a3a5b94f656887e6b5a))
-   added sequelize adapter ([#19](https://github.com/powerhouse-inc/document-drive/issues/19)) ([71529d8](https://github.com/powerhouse-inc/document-drive/commit/71529d8d60eb6ff0390bdebb1bb660fb680c99f3))
-   added strandUpdate events ([1143716](https://github.com/powerhouse-inc/document-drive/commit/11437161fd1b0b0f37a7ef50833022507e4699f3))
-   added support for update noop operations ([#42](https://github.com/powerhouse-inc/document-drive/issues/42)) ([c59e15a](https://github.com/powerhouse-inc/document-drive/commit/c59e15a69f08f2abe654ce15c090f1212aee7606))
-   bug fixing ([1bb6097](https://github.com/powerhouse-inc/document-drive/commit/1bb60972588b5b95d2bb52354d8b35319d21eed5))
-   bump libs ([8b18624](https://github.com/powerhouse-inc/document-drive/commit/8b18624c05792d086b31a0b42b99cf42f3dc0627))
-   bump lint deps ([c4a68c9](https://github.com/powerhouse-inc/document-drive/commit/c4a68c9d1c8fea85d85d18eebf66a53d57438dbd))
-   change unimportant rules to warn ([3958150](https://github.com/powerhouse-inc/document-drive/commit/395815033e8fe5e937342b5b2ba1d57ba64cbc8d))
-   defined types and functions ([0b57ae9](https://github.com/powerhouse-inc/document-drive/commit/0b57ae969f023f06ffc4859d1f8f514ef7a2508f))
-   delete sync units before removing document ([6b54e1d](https://github.com/powerhouse-inc/document-drive/commit/6b54e1dfb7249c0c6e061e916783ac92cb5d1481))
-   don't send operation with index equal to fromRevision ([f279046](https://github.com/powerhouse-inc/document-drive/commit/f279046f156c3b9c35c1c7cdd950319078f09e04))
-   emit sync events when updating listeners ([b1899bb](https://github.com/powerhouse-inc/document-drive/commit/b1899bbe6a3d555fc6ea5236c55b1417def11ec2))
-   implementation of switchboard transmitter ([cfbdc85](https://github.com/powerhouse-inc/document-drive/commit/cfbdc8570dfc86b6fe949c5246b240c634917a99))
-   implemented operation validation for document operations ([39bedf4](https://github.com/powerhouse-inc/document-drive/commit/39bedf43d2a3b1fda51d82f26b7f92b93a7cce5b))
-   improved operation errors ([a05772d](https://github.com/powerhouse-inc/document-drive/commit/a05772d023c600dd85d50be65f1ee80b19d546ef))
-   init listener manager ([0edb539](https://github.com/powerhouse-inc/document-drive/commit/0edb53988f691672a3c3e0ce3179142bc09b6b58))
-   run pull loop immediately for the first time ([802a126](https://github.com/powerhouse-inc/document-drive/commit/802a126e4ec90b5b62ad3e228cee73daa06cf651))
-   sync protocol draft ([f5ef843](https://github.com/powerhouse-inc/document-drive/commit/f5ef8436f9dfa50b546c77363bc8edfb887d671c))
-   update config ([c0197a6](https://github.com/powerhouse-inc/document-drive/commit/c0197a6bd86cdb706883e9cd7f0cad017fa115de))
-   updated prisma schema with syncUnits and listeners ([224cbfe](https://github.com/powerhouse-inc/document-drive/commit/224cbfe51d97a2107ea114cc00a7a1665278f85c))
