// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.


// History expansion: store a "last command" and allow substituting !! and !$ in
// other commands corresponding to bash semantics. See the unit tests for
// examples.

/// <reference path="lexer.ts" />

import * as lexer from "./lexer";

export default class HistoryExpander {
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
