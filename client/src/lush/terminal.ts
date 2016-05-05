// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.


interface Terminal {
    set_command(argv: string);
    focus();
    error(msg: string);
}

export = Terminal
