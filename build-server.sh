#!/bin/bash

set -eu -o pipefail
${DEBUGSH:+set -x}

MYDIR="${BASH_SOURCE%/*}"
if [[ ! -d "$MYDIR" ]]; then
	echo "Couldn't get script execution directory" >&2
	exit 1
fi
# Expand to full path
MYDIR="$(cd "$MYDIR"; pwd -P)"

## Build the server using docker
## Run this first: docker build -t lush-server .

bin_ext=""
if [[ "$GOOS" == "windows" ]]; then
	bin_ext=.exe
fi
bin_name="lush-$GOOS-$GOARCH$bin_ext"

# Map the latest source files and run go get again. Will automatically download
# any new dependencies (but not update existing ones) and install in
# /go/bin/lush.
docker run \
	--rm \
	-e GOOS="$GOOS" \
	-e GOARCH="$GOARCH" \
	-v "$MYDIR:/go/src/github.com/hraban/lush" \
	-w /go/src/github.com/hraban/lush \
	lush-server \
	go build ${DEBUGSH:+ -v} -o "$bin_name"
