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

. "$MYDIR/build-server.sh"
. "$MYDIR/client/build-client.sh"
