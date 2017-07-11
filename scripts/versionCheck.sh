#!/usr/bin/env bash

set -e # halt script on error

TARGET_BRANCH=$1
IS_PULL_REQUEST=$2  # false if not a pull request,

# Makes sure travis checks version only if doing a pull request
if [ "$IS_PULL_REQUEST" != "false" ]
    then
        PACKAGE_VERSION=$(grep version package.json | awk -F: '{ print $2 }' | sed 's/[\",]//g' | tr -d ':space:') && echo "Package Version: $PACKAGE_VERSION"
        CURRENT_PACKAGE_VERSION=$(git show 'origin/'"$TARGET_BRANCH"':package.json' | grep version | head -1 | awk -F: '{ print $2 }' | sed 's/[\",]//g' | tr -d ':space:') && echo "Latest Version: $CURRENT_PACKAGE_VERSION"

        if [ "$CURRENT_PACKAGE_VERSION" = "$PACKAGE_VERSION" ]
            then
                echo "Failure reason: Version number should be bumped."
                exit 1
        fi
fi
