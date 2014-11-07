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


// History expansion: store a "last command" and allow substituting !! and !$ in
// other commands corresponding to bash semantics. See the unit tests for
// examples.

/// <reference path="lexer.ts" />

import lexer = require("lush/lexer");

class HistoryExpander {
    private _lastCmd = '';
    private _lastArg = '';
    private _lexer = new lexer.Lexer();

    constructor() {
        // Errors are not important for history expander
        this._lexer.onerror = () => {};
    }

    expand(txt: string) {
        var hexp = this;
        var slices = [];
        var prevI = 0;
        hexp._lexer.onPreviousCommand = function (i) {
            slices.push(txt.slice(prevI, i));
            slices.push(hexp._lastCmd);
            // skip the currently added slice, and the !!
            prevI = i+2;
        };
        hexp._lexer.onPreviousLastArg = function (i) {
            slices.push(txt.slice(prevI, i));
            slices.push(hexp._lastArg);
            prevI = i+2;
        };
        try {
            hexp._lexer.parse(txt);
        } finally {
            hexp._lexer.onPreviousCommand = undefined;
            hexp._lexer.onPreviousLastArg = undefined;
        }
        slices.push(txt.slice(prevI));
        return slices.join("");
    }

    setlast(txt: string) {
        var hexp = this;
        hexp._lastCmd = txt;
        hexp._lexer.onboundary = function (start, end) {
            hexp._lastArg = txt.slice(start, end);
        };
        try {
            hexp._lexer.parse(txt);
        } finally {
            hexp._lexer.onboundary = undefined;
        }
    }
}

export = HistoryExpander;
