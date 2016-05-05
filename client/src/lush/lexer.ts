// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.


// PROMPT PARSING

export enum ERRCODES {
    UNBALANCED_SINGLE_QUOTE,
    UNBALANCED_DOUBLE_QUOTE,
    TERMINATING_BACKSLASH,
    BARE_EXCLAMATIONMARK
}

// declare normal Error class
export declare class Error {
    public name: string;
    public message: string;
    public stack: string;
    constructor(message?: string);
}

export class ParseError extends Error {
    type: ERRCODES;

    constructor(msg: string, type: ERRCODES) {
        super(msg);
        this.name = "ParseError";
        this.message = msg;
        this.type = type;
    }
}

interface CharParser {
    (x: string, y: number): CharParser;
}

interface State {
    raw: string;
    idx: number;
    // Index of opening quote
    quotestart: number;
    // when true the next boundary will trigger an "onboundary" event.  idea
    // behind this: set to true at every char that is part of a word (non-space,
    // non-special like pipe), on every space char (or other special char)
    // generate an onboundary event if this is true then set it to false. also
    // generate the event at end of input.
    parsingword: boolean;
    // index of the start of the word currently being parsed eg in "foo bar", at
    // idx = 5 (a), wordstart = 4 (b)
    wordstart: number;
}

export class Lexer {

    // Overwrite these handlers to listen for tokens

    public onliteral: (c: string) => void;
    public oninit: () => void;
    public onboundary: (start: number, end: number) => void;
    public onpipe: () => void;
    // if no callback specified for ? treat it as literal
    public onglobQuestionmark: (i: number) => void;
    // if no callback specified for * treat it as literal
    public onglobStar: (i: number) => void;
    public onPreviousLastArg: (i: number) => void;
    public onPreviousCommand: (i: number) => void;
    // default behavior: NOP. This is inconsistent with the other default
    // handlers that invoke onliteral(), but that's because I just decided that
    // those are wrong. It's confusing and useless.  This is a shell lexer,
    // don't be surprised at missing tokens if you're not subscribing to the
    // proper hooks.  TODO: All other default handlers should act like this.
    public onsemicolon: () => void;
    public onerror: (e: ParseError) => void;

    private state: State;

    // Call at start of every new parsing to allow caller resetting to default
    // by setting to undefined.
    private setDefaultHandlers() {
        this.onliteral = this.onliteral || (() => {});
        this.oninit = this.oninit || (() => {});
        this.onboundary = this.onboundary || (() => {});
        this.onpipe = this.onpipe || function () {
            this.onliteral('|');
        };
        // if no callback specified for ? treat it as literal
        this.onglobQuestionmark = this.onglobQuestionmark || function () {
            this.onliteral('?');
        };
        // if no callback specified for * treat it as literal
        this.onglobStar = this.onglobStar || function () {
            this.onliteral('*');
        };
        this.onPreviousLastArg = this.onPreviousLastArg || function () {
            this.onliteral('!');
            this.onliteral('$');
        };
        this.onPreviousCommand = this.onPreviousCommand || function () {
            this.onliteral('!');
            this.onliteral('!');
        };
        this.onsemicolon = this.onsemicolon || (() => {});
        this.onerror = this.onerror || function (e) {
            throw e;
        };
    }

    _callOnError(msg, type) {
        var lexer = this;
        var e = new ParseError(msg, type);
        lexer.onerror(e);
    }

    // the next char that will be popped. undefined at end of input
    peek(): string {
        if (this.state.idx < this.state.raw.length) {
            return this.state.raw[this.state.idx];
        }
    }

    // pop a character off the input. returns undefined when end of input has
    // been reached
    popc(): string {
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
    }

    // in single quote mode, only a ' changes state
    private parse_char_quote_single(c, i): CharParser {
        var lexer = this;
        if (c === undefined) {
            lexer._callOnError("unbalanced single quotes",
                               ERRCODES.UNBALANCED_SINGLE_QUOTE);
            return;
        }
        if (c == "'") {
            return this.parse_char_normal;
        }
        lexer.onliteral(c);
    }

    // in double quote mode, only a " changes state
    private parse_char_quote_double(c, i): CharParser {
        var lexer = this;
        if (c === undefined) {
            lexer._callOnError("unbalanced double quotes",
                               ERRCODES.UNBALANCED_DOUBLE_QUOTE);
            return;
        }
        if (c == '"') {
            return this.parse_char_normal;
        }
        lexer.onliteral(c);
    }

    private parse_char_escaped(c, i): CharParser {
        var lexer = this;
        if (c === undefined) {
            lexer._callOnError("backslash at end of input",
                               ERRCODES.TERMINATING_BACKSLASH);
            return;
        }
        lexer.onliteral(c);
        // escaping only lasts one char
        return this.parse_char_normal;
    }

    private parse_char_exclamationmark(c, i): CharParser {
        var lexer = this;
        var newstr: string;
        switch (c) {
        case '!':
            lexer.onPreviousCommand(i-1);
            break;
        case '$':
            lexer.onPreviousLastArg(i-1);
            break;
        default:
            lexer._callOnError("! must be followed by ! or $",
                               ERRCODES.BARE_EXCLAMATIONMARK);
            return;
        }
        lexer.state.parsingword = true;
        return this.parse_char_normal;
    }

    private registerBoundary(i: number) {
        var lexer = this;
        if (lexer.state.parsingword) {
            lexer.onboundary(lexer.state.wordstart, i);
            lexer.state.parsingword = false;
        }
    }

    private parse_char_normal(c, i) {
        var lexer = this;
        if (c === undefined) {
            lexer.registerBoundary(i);
            return;
        }
        // these chars have special meaning
        switch (c) {
        case "'":
            // Start new single quoted block
            lexer.state.quotestart = i;
            lexer.state.parsingword = true;
            return lexer.parse_char_quote_single;
        case '"':
            // Start new double quoted block
            lexer.state.quotestart = i;
            lexer.state.parsingword = true;
            return lexer.parse_char_quote_double;
        case '\\':
            lexer.state.parsingword = true;
            return lexer.parse_char_escaped;
        case ' ':
            // Word boundary
            lexer.registerBoundary(i);
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
            lexer.registerBoundary(i);
            lexer.onpipe();
            break;
        case '!':
            return lexer.parse_char_exclamationmark;
        case ';':
            lexer.registerBoundary(i);
            lexer.onsemicolon();
            break;
        default:
            lexer.onliteral(c);
            lexer.state.parsingword = true;
            break;
        }
    }

    parse(raw: string) {
        this.setDefaultHandlers();
        this.state = {
            raw: "",
            idx: 0,
            quotestart: -1,
            parsingword: false,
            wordstart: -1
        };
        this.oninit();
        this.state.raw = raw;
        var f: CharParser = this.parse_char_normal; // ISA state as function
        var c: string;
        // do while so that a last c === undefined still gets handled (notify
        // state func of EOF)
        do {
            var i: number = this.state.idx;
            c = this.popc();
            f = f.call(this, c, i) || f;
        } while (c !== undefined);
    }
}
