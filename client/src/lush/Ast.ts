// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.

// An Ast node represents the (rich) argv of one command. the complete command
// line consists of one or more commands chained by pipes. it is represented as
// a linked list of AST nodes.
class Ast {
    // updated after each call to setprompt()
    argv: string[] = [];
    // true when newarg contains a globbing char
    hasglob: boolean = false;
    // pointer to next command, if any
    stdout: Ast;
    // building the next argument
    newarg = '';

    getName(): string {
        var ast = this;
        return ast.argv.join(' ');
    }
}

export = Ast;
