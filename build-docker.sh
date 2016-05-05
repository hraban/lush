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

if [[ "${1--h}" == "-h" ]]; then
	echo "Usage: $0 (darwin | linux | windows) (386 | amd64)" >&2
	exit 1
fi

export GOOS="${1?First argument must be GOOS (darwin/linux/windows)}"
export GOARCH="${2?Second argument must be arch (386/amd64)}"

## Build the server using docker
## Run this first: docker build -t lush-server .

container_name="$(date "+lush-server-%Y-%m-%dT%H_%M_%sZ")"

bin_ext=""
if [[ "$GOOS" == "windows" ]]; then
	bin_ext=.exe
fi
bin_name="lush-$GOOS-$GOARCH$bin_ext"

# Map the latest source files and run go get again. Will automatically download
# any new dependencies (but not update existing ones) and install in
# /go/bin/lush.
docker run \
	-e GOOS="$GOOS" \
	-e GOARCH="$GOARCH" \
	-v "$MYDIR:/go/src/github.com/hraban/lush" \
	-w /go/src/github.com/hraban/lush \
	--name "$container_name" \
	lush-server \
	go build ${DEBUGSH:+ -v} -o "$bin_name"

docker cp "$container_name:/go/src/github.com/hraban/lush/$bin_name" "$MYDIR/$bin_name"
docker rm "$container_name" > /dev/null
