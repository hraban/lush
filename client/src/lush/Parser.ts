// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.


// PROMPT PARSING

/// <reference path="Ast.ts" />
/// <reference path="HistoryExpander.ts" />
/// <reference path="lexer.ts" />
/// <reference path="utils.ts" />

import * as $ from "jquery";
import Ast from "./Ast";
import HistoryExpander from "./HistoryExpander";
import * as lexer from "./lexer";
import * as U from "./utils";

function startsWithDot(str: string): boolean {
    return str[0] == ".";
}

// List of files matching a pattern. If showhidden is false this excludes files
// starting with a dot. If showhidden is not specified this only shows those
// files if the pattern itself starts with a dot.
//
// TODO: Function does two things: fetching list of files from server and
// processing it locally. This makes unit testing impossible, which already led
// to a bug. Needs to be separated and testable.
function defaultGlob(pattern, showhidden?) {
    var files: string[] = [];
    $.ajax('/files.json', {
        data: {pattern: pattern},
        success: function (x) {
            files = x;
        },
        async: false
    });
    if (showhidden === undefined) {
        showhidden = startsWithDot(pattern);
    }
    if (!showhidden) {
        // hide files starting with a dot
        files = files.filter(x => !startsWithDot(x));
    }
    return files;
}

interface GlobFunction {
    (pattern: string, showhidden?: boolean): string[];
}

interface ParserContext {
    // the first parsed command, head of the linked list. pointer to
    // the next is in the "stdout" member of the ast node.
    firstast: Ast;
    // The command currently being parsed
    ast: Ast;
}

// Simple interface, "parse everything at once" parser. No callbacks, no state
// between calls, just call .parse("your command string"), and access
// .ctx.firstast. or .ctx.ast for the last node.
export default class Parser {
    public ctx: ParserContext = {
        firstast: null,
        ast: null
    };

    // quite a misnomer: this is AFTER history expansion
    private _raw = '';
    private _ignoreErrors = false;
    private _lexer = new lexer.Lexer();
    // First layer of parsing: find all !$ and !! and expand them.
    private _histExp = new HistoryExpander();

    // Second layer of parsing: split the text up in separate words (argv)
    constructor(private globf: GlobFunction = defaultGlob) {
        var parser = this;
        var lex = parser._lexer;
        var ctx = parser.ctx;
        lex.oninit = function () {
            ctx.firstast = ctx.ast = new Ast();
        };
        lex.onliteral = function (c) {
            // internal representation is escaped
            ctx.ast.newarg += U.parserEscape(c);
        };
        lex.onglobQuestionmark = function () {
            ctx.ast.hasglob = true;
            ctx.ast.newarg += '?';
        };
        lex.onglobStar = function () {
            ctx.ast.hasglob = true;
            ctx.ast.newarg += '*';
        };
        function onboundary() {
            if (ctx.ast.hasglob) {
                var matches = parser.globf(ctx.ast.newarg);
                // TODO: error if matches is empty
                ctx.ast.argv.push.apply(ctx.ast.argv, matches);
            } else {
                // undo internal escape representation
                ctx.ast.argv.push(U.parserUnescape(ctx.ast.newarg));
            }
            ctx.ast.hasglob = false;
            ctx.ast.newarg = '';
        };
        lex.onboundary = onboundary;
        // encountered a | character
        lex.onpipe = function () {
            // this is a fresh command
            var newast = new Ast();
            // which is the child of the previously parsed cmd
            ctx.ast.stdout = newast;
            // haiku
            ctx.ast = newast;
        };
        lex.onsemicolon = function () {
            if (!parser._ignoreErrors) {
                throw "semi-colon not supported (yet)";
            }
        };
        lex.onerror = function (err) {
            if (!parser._ignoreErrors) {
                throw err;
            }
            switch (err.type) {
            case lexer.ERRCODES.BARE_EXCLAMATIONMARK:
            case lexer.ERRCODES.UNBALANCED_SINGLE_QUOTE:
            case lexer.ERRCODES.UNBALANCED_DOUBLE_QUOTE:
            case lexer.ERRCODES.TERMINATING_BACKSLASH:
                // ignore, treat whatever was here as a word.
                onboundary();
                break;
            default:
                throw new Error("unknown parser error: " + err);
            }
        };
    }

    parse(txt: string, ignoreParseErrors: boolean = false): Ast {
        var parser = this;
        parser._ignoreErrors = ignoreParseErrors;
        var expanded = parser._histExp.expand(txt);
        parser._lexer.parse(expanded);
        parser._raw = expanded;
        return parser.ctx.firstast;
    }

    // Store most recently parsed text as the "previous command".  History
    // functions (!$ and !!) operate on this value.  E.g.: parse('foo');
    // commit(); parse('bar'); parse('!!'); will yield 'foo'.
    commit() {
        var parser = this;
        parser._histExp.setlast(parser._raw);
    }
}
