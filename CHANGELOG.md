# [1.5.0](https://github.com/powerhouse-inc/document-model/compare/v1.4.0...v1.5.0) (2024-06-03)


### Features

* garbage collect operations when loading zip file ([f448131](https://github.com/powerhouse-inc/document-model/commit/f448131a0b26d4b9fb40426eb0d6b7ab96e137a1))

# [1.4.0](https://github.com/powerhouse-inc/document-model/compare/v1.3.0...v1.4.0) (2024-06-03)


### Features

* added unsafe reducer (mutable) ([5f417af](https://github.com/powerhouse-inc/document-model/commit/5f417af25f62fd15533306f9ed949087b851c78c))
* migrated from immer to mutative ([8b50a4f](https://github.com/powerhouse-inc/document-model/commit/8b50a4f70034da0afedec8db697a10f8739c6a3b))

# [1.3.0](https://github.com/powerhouse-inc/document-model/compare/v1.2.0...v1.3.0) (2024-05-29)


### Features

* fix create zip when there is no attachments ([26d9d81](https://github.com/powerhouse-inc/document-model/commit/26d9d81d99ccc8be74400e69b6141cfa2b2a3899))

# [1.2.0](https://github.com/powerhouse-inc/document-model/compare/v1.1.0...v1.2.0) (2024-05-22)


### Features

* operation id integration in attachBranch helper ([67a36bf](https://github.com/powerhouse-inc/document-model/commit/67a36bf371aada36fa68b5c44eac8dbdabfb98c0))

# [1.1.0](https://github.com/powerhouse-inc/document-model/compare/v1.0.53...v1.1.0) (2024-05-22)


### Bug Fixes

* fix lint errors ([3848f51](https://github.com/powerhouse-inc/document-model/commit/3848f51247d8a96744a4f21e44034238f93f46b0))


### Features

* add base url ([4eab8c6](https://github.com/powerhouse-inc/document-model/commit/4eab8c6f7deb8f3ea02ef31041d1e18461a4daa5))
* added experimental release setup ([014410e](https://github.com/powerhouse-inc/document-model/commit/014410e0b493f7562b27268392d506ffa32a5735))
* added id field to operation schema ([b3d635d](https://github.com/powerhouse-inc/document-model/commit/b3d635da5f4bea0d4625b112a9530e5e7c6a6745))
* added preprare script for husky ([bd1d405](https://github.com/powerhouse-inc/document-model/commit/bd1d405b48b987b653e1322ca82ec2d290db3d47))
* added processSkipOperation helper ([2b56e53](https://github.com/powerhouse-inc/document-model/commit/2b56e53aafc799ce2b4c90bb1c108e84e5f11c1d))
* added release config ([26a315b](https://github.com/powerhouse-inc/document-model/commit/26a315b7498bb818ce0710c5a1f3d71963bb38f9))
* added skipHeaderOperations util ([ea760dd](https://github.com/powerhouse-inc/document-model/commit/ea760dd22b6e7242fba64bea355a2116d26dfa49))
* change replayOperations to expect clearedOperations ([5d7c7c5](https://github.com/powerhouse-inc/document-model/commit/5d7c7c58ac8dd479c57c5cd19e398fcc9d35430d))
* correctly set header and resulting state when replaying document ([3183d06](https://github.com/powerhouse-inc/document-model/commit/3183d06ca30fefd15955b09a3cf63d292ee4dc0a))
* filter duplicated operations in merge helper ([4e9c626](https://github.com/powerhouse-inc/document-model/commit/4e9c62670e684094f79c25fbf42d34c122827671))
* fix last operation check ([51dc692](https://github.com/powerhouse-inc/document-model/commit/51dc69268ccb9d361c28bba45f5cfcac6e136595))
* fix nextIndex validation ([4a48fa6](https://github.com/powerhouse-inc/document-model/commit/4a48fa6c893855cd22db16c7a09ffc5f544bc404))
* implemented append-only operations into reducer ([61bea1b](https://github.com/powerhouse-inc/document-model/commit/61bea1bfdf59db01f852cd326f39d3f6047f2ac5))
* migrated document-helpers ([d37af90](https://github.com/powerhouse-inc/document-model/commit/d37af909c6145083ecbda57fb881cfb69ed2869f))
* only run release manually ([54e3b48](https://github.com/powerhouse-inc/document-model/commit/54e3b48bb6b8d4e81fa2795914a10aebb8981210))
* return garbage collected history from reducer ([e7320e7](https://github.com/powerhouse-inc/document-model/commit/e7320e706fa225b07e68eb55fd37697f87676627))
* revert state when a skip operation fails ([0f1ea8b](https://github.com/powerhouse-inc/document-model/commit/0f1ea8b498c5998f741697673c0d82df8d7ee702))
* small fixes ([4d9e757](https://github.com/powerhouse-inc/document-model/commit/4d9e757950090d0f5eac42410f71ae7d3771e687))
* support reusing operation resulting state when replaying document ([6dee233](https://github.com/powerhouse-inc/document-model/commit/6dee233641d19dc5d50e18d4b8cee43bdbe3709e))

# [1.1.0-experimental.3](https://github.com/powerhouse-inc/document-model/compare/v1.1.0-experimental.2...v1.1.0-experimental.3) (2024-05-20)


### Features

* correctly set header and resulting state when replaying document ([3183d06](https://github.com/powerhouse-inc/document-model/commit/3183d06ca30fefd15955b09a3cf63d292ee4dc0a))

# [1.1.0-experimental.3](https://github.com/powerhouse-inc/document-model/compare/v1.1.0-experimental.2...v1.1.0-experimental.3) (2024-05-20)


### Features

* correctly set header and resulting state when replaying document ([3183d06](https://github.com/powerhouse-inc/document-model/commit/3183d06ca30fefd15955b09a3cf63d292ee4dc0a))

# [1.1.0-experimental.2](https://github.com/powerhouse-inc/document-model/compare/v1.1.0-experimental.1...v1.1.0-experimental.2) (2024-05-20)


### Features

* support reusing operation resulting state when replaying document ([6dee233](https://github.com/powerhouse-inc/document-model/commit/6dee233641d19dc5d50e18d4b8cee43bdbe3709e))

# [1.1.0-experimental.1](https://github.com/powerhouse-inc/document-model/compare/v1.0.53...v1.1.0-experimental.1) (2024-05-06)


### Features

* added experimental release setup ([014410e](https://github.com/powerhouse-inc/document-model/commit/014410e0b493f7562b27268392d506ffa32a5735))
* added preprare script for husky ([bd1d405](https://github.com/powerhouse-inc/document-model/commit/bd1d405b48b987b653e1322ca82ec2d290db3d47))
* added processSkipOperation helper ([2b56e53](https://github.com/powerhouse-inc/document-model/commit/2b56e53aafc799ce2b4c90bb1c108e84e5f11c1d))
* added release config ([26a315b](https://github.com/powerhouse-inc/document-model/commit/26a315b7498bb818ce0710c5a1f3d71963bb38f9))
* added skipHeaderOperations util ([ea760dd](https://github.com/powerhouse-inc/document-model/commit/ea760dd22b6e7242fba64bea355a2116d26dfa49))
* change replayOperations to expect clearedOperations ([5d7c7c5](https://github.com/powerhouse-inc/document-model/commit/5d7c7c58ac8dd479c57c5cd19e398fcc9d35430d))
* fix last operation check ([51dc692](https://github.com/powerhouse-inc/document-model/commit/51dc69268ccb9d361c28bba45f5cfcac6e136595))
* fix nextIndex validation ([4a48fa6](https://github.com/powerhouse-inc/document-model/commit/4a48fa6c893855cd22db16c7a09ffc5f544bc404))
* implemented append-only operations into reducer ([61bea1b](https://github.com/powerhouse-inc/document-model/commit/61bea1bfdf59db01f852cd326f39d3f6047f2ac5))
* migrated document-helpers ([d37af90](https://github.com/powerhouse-inc/document-model/commit/d37af909c6145083ecbda57fb881cfb69ed2869f))
* only run release manually ([54e3b48](https://github.com/powerhouse-inc/document-model/commit/54e3b48bb6b8d4e81fa2795914a10aebb8981210))
* return garbage collected history from reducer ([e7320e7](https://github.com/powerhouse-inc/document-model/commit/e7320e706fa225b07e68eb55fd37697f87676627))
* revert state when a skip operation fails ([0f1ea8b](https://github.com/powerhouse-inc/document-model/commit/0f1ea8b498c5998f741697673c0d82df8d7ee702))
* small fixes ([4d9e757](https://github.com/powerhouse-inc/document-model/commit/4d9e757950090d0f5eac42410f71ae7d3771e687))
