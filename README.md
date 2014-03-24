Lush is a shell that is accessible through a browser instead of a terminal
emulator.

It is not technically a "(login) shell" but you use it where you would normally
log in to a server with ssh. Or instead of opening a terminal on your own computer.

The goal of lush is to reinvent interaction with an operating system. Currently
there are two major players: the command line and graphical shells. Lush is a
third option that leverages the webbrowser as the UI.

See https://github.com/hraban/lush/wiki for more info.

## Lush on Linux

Download and install:

    $ go get github.com/hraban/lush

To run the program find the executable (somewhere in $GOPATH/bin/) and launch
it. E.g.:

    $ ${GOPATH%%:*}/bin/lush

## Lush on Windows

Lush works just fine on Windows.

Installing lush on Windows comes in two flavors: download a binary release or
install from source.

The binary release includes grep, cat, etc. for that real "terminal feel".

## Lush on Windows: Binary (EASY!)

Go to:

http://github.com/hraban/lush/releases

Download the latest .zip. Unzip, find lush.exe, double click it. Done.

## Lush on Windows: Source

**open a command window and type:**

    go get github.com/hraban/lush

(Getting errors? Make sure you have Go, Git and Mercurial installed on Windows.
For instructions: see
https://github.com/hraban/lush/wiki/Installing-Go-on-Windows)

It will download lush (to `c:\go3d\src\github.com\hraban\lush` if you followed
the instructions from the wiki) and install it (as `c:\go3d\bin\lush.exe`).

**Run lush by double clicking the .exe!** Create a shortcut to your desktop for easy access.

To update lush:

    go get -u github.com/hraban/lush

That's it.

## Afterword

The code is available on github at https://github.com/hraban/lush

Feel free to contact me for more info

Hraban Luyat
hraban@0brg.net
March 2014
