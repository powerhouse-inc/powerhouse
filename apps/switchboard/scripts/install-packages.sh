#!/bin/bash

# check if PH_PACKAGES is set
if [ -z "${PH_PACKAGES}" ]; then
    echo "PH_PACKAGES is not set"
    exit 1
fi

# replace commas with spaces in env var PH_PACKAGES
PH_PACKAGES=$(echo "${PH_PACKAGES}" | tr ',' ' ')

# install packages
ph install $(echo "${PH_PACKAGES}" | tr ',' ' ') --package-manager pnpm

