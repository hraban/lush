// Copyright © 2013, 2014 Hraban Luyat <hraban@0brg.net>
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


// PROMPT PARSING

define(function () {
    // Quote flag state in parsing
    var QUOTE_NONE = 0;
    var QUOTE_SINGLE = 1;
    var QUOTE_DOUBLE = 2;

    var Lexer = function () {
    };

    Lexer.ERRCODES = {
        UNBALANCED_SINGLE_QUOTE: 1,
        UNBALANCED_DOUBLE_QUOTE: 2,
        TERMINATING_BACKSLASH: 3,
        BARE_EXCLAMATIONMARK: 4,
    };

    function makeParseError(msg, type) {
        var e = new Error(msg);
        e.name = "ParseError";
        e.type = type;
        return e;
    }

    function defaultOnError(err) {
        throw err;
    }

    Lexer.prototype._callOnError = function (msg, type) {
        var lexer = this;
        var e = makeParseError(msg, type);
        lexer.onerror(e);
    };

    // the next char that will be popped. undefined at end of input
    Lexer.prototype.peek = function () {
        if (this.state.idx < this.state.raw.length) {
            return this.state.raw[this.state.idx];
        }
    };

    // pop a character off the input. returns undefined when end of input has
    // been reached
    Lexer.prototype.popc = function () {
        var lexer = this;
        var i = lexer.state.idx;
        if (i < lexer.state.raw.length) {
            if (!lexer.state.parsingword) {
                lexer.state.wordstart = i;
            }
            var c = lexer.state.raw[i];
            lexer.state.idx = i + 1;
            return c;
        }
    };

    // in single quote mode, only a ' changes state
    function parse_char_quote_single(lexer, c, i) {
        if (c === undefined) {
            lexer._callOnError("unbalanced single quotes",
                               Lexer.ERRCODES.UNBALANCED_SINGLE_QUOTE);
            return;
        }
        if (c == "'") {
            return parse_char_normal;
        }
        lexer.onliteral(c);
    }

    // in double quote mode, only a " changes state
    function parse_char_quote_double(lexer, c, i) {
        if (c === undefined) {
            lexer._callOnError("unbalanced double quotes",
                               Lexer.ERRCODES.UNBALANCED_DOUBLE_QUOTE);
            return;
        }
        if (c == '"') {
            return parse_char_normal;
        }
        lexer.onliteral(c);
    }

    function parse_char_escaped(lexer, c, i) {
        if (c === undefined) {
            lexer._callOnError("backslash at end of input",
                               Lexer.ERRCODES.TERMINATING_BACKSLASH);
            return;
        }
        lexer.onliteral(c);
        // escaping only lasts one char
        return parse_char_normal;
    }

    function parse_char_exclamationmark(lexer, c, i) {
        var newstr;
        switch (c) {
        case '!':
            lexer.onPreviousCommand(i-1);
            break;
        case '$':
            lexer.onPreviousLastArg(i-1);
            break;
        default:
            lexer._callOnError("! must be followed by ! or $",
                               Lexer.ERRCODES.BARE_EXCLAMATIONMARK);
            return;
        }
        lexer.state.parsingword = true;
        return parse_char_normal;
    }

    function registerBoundary(lexer, i) {
        if (lexer.state.parsingword) {
            lexer.onboundary(lexer.state.wordstart, i);
            lexer.state.parsingword = false;
        }
    }

    function parse_char_normal(lexer, c, i) {
        if (c === undefined) {
            registerBoundary(lexer, i);
            return;
        }
        // these chars have special meaning
        switch (c) {
        case "'":
            // Start new single quoted block
            lexer.state.quotestart = i;
            lexer.state.parsingword = true;
            return parse_char_quote_single;
        case '"':
            // Start new double quoted block
            lexer.state.quotestart = i;
            lexer.state.parsingword = true;
            return parse_char_quote_double;
        case '\\':
            lexer.state.parsingword = true;
            return parse_char_escaped;
        case ' ':
            // Word boundary
            registerBoundary(lexer, i);
            break;
        case '*':
            lexer.onglobStar(i);
            lexer.state.parsingword = true;
            break;
        case '?':
            lexer.onglobQuestionmark(i);
            lexer.state.parsingword = true;
            break;
        case '|':
            registerBoundary(lexer, i);
            lexer.onpipe();
            break;
        case '!':
            return parse_char_exclamationmark;
        case ';':
            registerBoundary(lexer, i);
            lexer.onsemicolon();
            break;
        default:
            lexer.onliteral(c);
            lexer.state.parsingword = true;
            break;
        }
    };

    Lexer.prototype.parse = function (raw) {
        this.state = {
            raw: "",
            idx: 0,
            quotetype: QUOTE_NONE,
            // Index of opening quote
            quotestart: -1,
            // when true the next boundary will trigger an "onboundary" event.
            // idea behind this: set to true at every char that is part of a
            // word (non-space, non-special like pipe), on every space char (or
            // other special char) generate an onboundary event if this is true
            // then set it to false. also generate the event at end of input.
            parsingword: false,
            // index of the start of the word currently being parsed
            // eg in "foo bar", at idx = 5 (a), wordstart = 4 (b)
            wordstart: -1,
        };
        if (this.oninit) {
            this.oninit();
        }
        if (!this.onliteral) {
            this.onliteral = function () {};
        }
        if (!this.onboundary) {
            this.onboundary = function () {};
        }
        if (!this.onpipe) {
            this.onpipe = function () {
                this.onliteral('|');
            };
        }
        // if no callback specified for ? treat it as literal
        if (!this.onglobQuestionmark) {
            this.onglobQuestionmark = function () {
                this.onliteral('?');
            };
        }
        // if no callback specified for * treat it as literal
        if (!this.onglobStar) {
            this.onglobStar = function () {
                this.onliteral('*');
            };
        }
        if (!this.onPreviousLastArg) {
            this.onPreviousLastArg = function () {
                this.onliteral('!');
                this.onliteral('$');
            };
        }
        if (!this.onPreviousCommand) {
            this.onPreviousCommand = function () {
                this.onliteral('!');
                this.onliteral('!');
            };
        }
        if (!this.onsemicolon) {
            this.onsemicolon = function () {
                this.onliteral(';');
            };
        }
        // only called for parse errors
        if (!this.onerror) {
            this.onerror = defaultOnError;
        }
        this.state.raw = raw;
        var f = parse_char_normal; // ISA state as function
        var c;
        // do while so that a last c === undefined still gets handled (notify
        // state func of EOF)
        do {
            var i = this.state.idx;
            c = this.popc();
            f = f(this, c, i) || f;
        } while (c !== undefined);
    };

    return Lexer;
});
