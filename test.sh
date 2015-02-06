#!/bin/bash

set -eu -o pipefail

fatal () {
	echo "$@" >&2
	exit 1
}

pidof lush && fatal "Lush already running, can't run tests"

go build ./posixtools/echo || exit 1
ECHOBIN=$PWD/echo
cleanecho () {
	rm -f $ECHOBIN
}
trap cleanecho EXIT

ECHOBIN=$ECHOBIN go test . ./liblush  || exit 1

phantompath="$(which phantomjs)"
if [[ -z "$phantompath" ]]
then
	echo Need phantomjs in PATH for unit testing qunit >&2
	exit 1
fi

# start a lush server
go build || exit 1
./lush -l 127.0.0.1:4737 &
lushpid=$!
cleanuplush() {
	cleanecho
	kill $lushpid
}
trap cleanuplush EXIT
sleep 3

phantomjs phantom-qunit-runner.js http://127.0.0.1:4737/test.html
phantomexit=$?

exit $phantomexit
