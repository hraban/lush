Lush is a shell that is accessible through a browser instead of a terminal
emulator.

It is not technically a "(login) shell" but you use it where you would normally
log in to a server with ssh. Or instead of opening a terminal on your own computer.

The goal of lush is to reinvent interaction with an operating system. Currently
there are two major players: the command line and graphical shells. Lush is a
third option that leverages the webbrowser as the UI.

## Windows Binary (Easy)

Go to:

http://github.com/hraban/lush/releases

Download the latest .zip. Unzip, find lush.exe, double click it. Done.

Includes grep, cat, etc. for that real "terminal feel".

## All platforms from source (Go & Docker)

(Only tested this on Mac. Should work on Linux and Windows, too.)

The server first needs to be downloaded and compiled using go:

    $ go get github.com/hraban/lush

Regardless of platform (Windows, Mac, Linux); you just need go installed.

(Note: if you don't regularly use go, you may not have a `GOPATH` set up. Do
something like this: `echo 'export GOPATH="$HOME"/gopath' >> ~/.bashrc; mkdir -p
~/gopath` and restart your shell before continuing these instructions. On
Windows, it's a little trickier.) 

After this, navigate to the go source directory, create a docker client builder
image and build the client using that:

    $ cd $GOPATH/src/github.com/hraban/lush/client
    $ docker build -t lush-client .
    $ ./build-docker.sh

Lush can now be started:

    $ $GOPATH/bin/lush

## Windows from Source

Prerequisites: Make sure you have Go, Git, Mercurial, Node.js and npm installed.

For instructions on installing Go, see
https://github.com/hraban/lush/wiki/Installing-Go-on-Windows.

Open a command window and type:

    go get github.com/hraban/lush

It will download lush (to `c:\go3d\src\github.com\hraban\lush`) and install it
(as `c:\go3d\bin\lush.exe`).

Install dependencies: gulp, bower, and the rest

    cd c:\go3d\src\github.com\hraban\lush\client
    npm install -g gulp bower
    npm install
    bower install
    gulp

Run lush by double clicking the .exe! Create a shortcut to your desktop for easy
access.

To update lush:

    go get -u github.com/hraban/lush
    cd c:\go3d\src\github.com\hraban\lush
    gulp

## Linux or Mac OS X

Installing Lush on Linux or Mac OS X is only possible from source.

For this, you will need node.js and go.

Download and install:

    $ go get github.com/hraban/lush
    $ cd $GOPATH/src/github.com/hraban/lush/client
    $ npm install -g gulp bower
    $ npm install
    $ bower install
    $ gulp

To run the program find the executable (somewhere in $GOPATH/bin/) and launch
it. E.g.:

    $ $GOPATH/bin/lush

## Afterword

The code is available on github at https://github.com/hraban/lush

See https://github.com/hraban/lush/wiki for more info, and feel free to contact
me:

Hraban Luyat  
hraban@0brg.net  
November 2014
