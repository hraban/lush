#!/bin/bash

set -eu -o pipefail
${DEBUGSH:+set -x}

MYDIR="${BASH_SOURCE%/*}"
if [[ ! -d "$MYDIR" ]]; then
	echo "Couldn't get script execution directory"
	exit 1
fi
# Expand to full path
MYDIR="$(cd "$MYDIR"; pwd -P)"

## Build the client using docker
## Run this first: docker build -t lush-client .

mkdir -p "$MYDIR/static"

docker run \
	--rm \
	-v "$MYDIR/src:/lush-client/src" \
	-v "$MYDIR/static:/lush-client/static" \
	lush-client
