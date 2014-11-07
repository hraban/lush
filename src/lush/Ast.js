// Copyright © 2014 Hraban Luyat <hraban@0brg.net>
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

"use strict";


define(function () {
    // An Ast node represents the (rich) argv of one command. the complete
    // command line consists of one or more commands chained by pipes. it is
    // represented as a linked list of AST nodes.
    function Ast() {
        var ast = this;
        // updated after each call to setprompt()
        ast.argv = [];
        // building the next argument
        ast._newarg = '';
        // true when _newarg contains a globbing char
        ast.hasglob = false;
        // pointer to next command, if any (undefined or Ast instance)
        ast.stdout = undefined;
    }

    Ast.prototype.getName = function () {
        var ast = this;
        return ast.argv.join(' ');
    };

    return Ast;
});
