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

var cmds = {};

define(["jquery",
        "lush/Ast",
        "lush/Cli",
        "lush/Command",
        "lush/HistoryExpander",
        "lush/lexer",
        "lush/Parser",
        "lush/Pool",
        "lush/utils"],
       function ($, Ast, Cli, Command, HistoryExpander, lexer, Parser, Pool, U) {

    test("lcp(): longest common prefix", function () {
        equal(U.lcp(["abcd", "abab", "abba"]), "ab");
        equal(U.lcp([]), "", "common prefix of 0 strings");
        equal(U.lcp(["foo", "bar"]), "");
        equal(U.lcp(["", "foo"]), "");
        equal(U.lcp(["burt", "burt"]), "burt");
    });

    test("U.splitn(): split string with limit", function () {
        deepEqual(U.splitn("a,b,c,d", ",", 3), ['a', 'b', 'c,d']);
        deepEqual(U.splitn("a,b,c,d", ",", 9), ['a', 'b', 'c', 'd']);
        deepEqual(U.splitn("a,b,c,d", ",", 1), ['a,b,c,d']);
        deepEqual(U.splitn("foo", "", 2), ['f', 'oo']);
        deepEqual(U.splitn("", ",", 1), [""]);
        deepEqual(U.splitn("", "", 1), []);
    });
    
    test("lexer: argv", function() {
        // parsing context
        var ctx;
        var lex = new lexer.Lexer();
        // parse a new sentence
        lex.oninit = function () {
            ctx = {
                newarg: '',
                argv: [],
            };
        };
        // a wild character appeared! add it to the current word
        lex.onliteral = function (c) {
            ctx.newarg += c;
        };
        // all literals found up to here: you are considered a word
        lex.onboundary = function () {
            ctx.argv.push(ctx.newarg);
            ctx.newarg = '';
        };
        var t = function (raw, out, name) {
            lex.parse(raw);
            deepEqual(ctx.argv, out, name);
        };
        t("foo bar baz", ['foo', 'bar', 'baz'], 'simple parsing');
        t("foo 'bar baz'", ['foo', 'bar baz'], 'single quotes');
        t('foo "bar baz"', ['foo', 'bar baz'], 'double quotes');
        t('foo "bar"baz', ['foo', 'barbaz'], 'concatenated words');
        t('foo "bar"\'\'b""""az', ['foo', 'barbaz'], 'concatenated quotes');
        t('"\'"', ["'"], 'quoted single quote');
        t("'\"'", ['"'], 'quoted double quote');
        t('foo bar\\ baz', ['foo', 'bar baz'], 'escaped space');
        t('foo \\" bar', ['foo', '"', 'bar'], 'escaped double quotes');
        t("foo \\' bar", ['foo', "'", 'bar'], 'escaped single quote');
        t("foo \\\\ bar", ['foo', "\\", 'bar'], 'escaped backslash');
    });
    
    test("lexer: globbing", function() {
        // simple lexer: replace literal globbing chars by an underscore.
        // ensures that all globbing chars in the resulting argv are actually
        // intended to be globbing chars, which is all we want to test for.
        var ctx;
        var lex = new lexer.Lexer();
        lex.oninit = function () {
            ctx = {
                newarg: '',
                argv: [],
            };
        };
        lex.onliteral = function (c) {
            ctx.newarg += c;
        };
        lex.onglobQuestionmark = function () {
            ctx.newarg += 'GLOB_QM';
        };
        lex.onglobStar = function () {
            ctx.newarg += 'GLOB_STAR';
        };
        lex.onboundary = function () {
            ctx.argv.push(ctx.newarg);
        };
        var t = function (raw, out, name) {
            lex.parse(raw);
            deepEqual(ctx.argv, out, name);
        };
        t('*', ['GLOB_STAR'], 'recognize bare globbing char (*)');
        t('?', ['GLOB_QM'], 'recognize bare globbing char (?)');
        t('\\*', ['*'], 'ignore escaped globbing char');
        t('"*"', ['*'], 'ignore quoted globbing char');
        t('foo*', ['fooGLOB_STAR'], 'composite: word + glob');
        t('foo\\*', ['foo*'], 'composite word + literal');
        t('foo\\*bar*', ['foo*barGLOB_STAR'], 'composite word + glob + literal');
    });

    // test the indexing of globbing character positions
    test("lexer: globbing char indexing", function() {
        var ctx;
        var lex = new lexer.Lexer();
        lex.oninit = function () {
            ctx = {
                cmd: '',
                gotstar: false,
                gotquestionmark: false,
                gotchoice: false,
            };
        };
        lex.onliteral = function (c) {
            ctx.cmd += c;
        };
        lex.onboundary = function (c) {
            ctx.cmd += '.';
        };
        lex.parse('foo ? bar');
        strictEqual(ctx.cmd, "foo.?.bar.", "Default ? handler: literal");
        lex.parse('x * y');
        strictEqual(ctx.cmd, "x.*.y.", "Default * handler: literal");
        // got a *
        lex.onglobStar = function (idx) {
            ctx.gotstar = idx;
        };
        // got a ?
        lex.onglobQuestionmark = function (idx) {
            ctx.gotquestionmark = idx;
        };
        lex.onglobChoice = function (choices, idx) {
            ctx.gotchoice = choices;
        };
        lex.parse('*');
        strictEqual(ctx.gotstar, 0, 'indexed wildcard: * (0)');
        lex.parse('foo*bar');
        strictEqual(ctx.gotstar, 3, 'indexed wildcard: * (3)');
        lex.parse('?');
        strictEqual(ctx.gotquestionmark, 0, 'indexed wildcard: ?');
        lex.parse('?*');
        strictEqual(ctx.gotquestionmark, 0, 'indexed wildcards: ?');
        strictEqual(ctx.gotstar, 1, 'indexed wildcards: *');
        // Not implemented yet
        //lex.parse('[abc]');
        //deepEqual(ctx.gotchoice, ['a', 'b', 'c'], 'wildcard choice: [abc]');
    });

    test("lexer: pipe syntax", function() {
        var ctx;
        var lex = new lexer.Lexer();
        lex.oninit = function () {
            ctx = {
                newarg: '',
            };
            ctx.cur_argv = [];
            ctx.all_argv = [ctx.cur_argv];
        };
        lex.onliteral = function (c) {
            ctx.newarg += c;
        };
        lex.onboundary = function () {
            ctx.cur_argv.push(ctx.newarg);
            ctx.newarg = '';
        };
        lex.onpipe = function () {
            ctx.cur_argv = [];
            ctx.all_argv.push(ctx.cur_argv);
        };

        lex.parse('trala blabla');
        deepEqual(ctx.all_argv, [["trala", "blabla"]], "no pipe");

        lex.parse('echo foobar | cat');
        deepEqual(ctx.all_argv, [["echo", "foobar"], ["cat"]], "pipe once");

        lex.parse('abc | yeye | ohno');
        deepEqual(ctx.all_argv, [["abc"], ["yeye"], ["ohno"]], "pipe twice");

        lex.parse('lookma|nospaces');
        deepEqual(ctx.all_argv, [["lookma"], ["nospaces"]], "no spaces around pipe");
    });

    test("lexer: !$ and !!", function () {
        var ctx;
        var lex = new lexer.Lexer();
        lex.oninit = function () {
            ctx = '';
        };
        lex.onliteral = function (c) {
            ctx += c;
        };
        lex.onboundary = function () {
            ctx += '.';
        };
        function testHistexp(str, expected, comment) {
            lex.parse(str);
            equal(ctx, expected, comment);
        }
        testHistexp('foo !$ bar', 'foo.!$.bar.', '!$: default handler returns literal');
        testHistexp('foo !! bar', 'foo.!!.bar.', '!!: default handler returns literal');
        testHistexp('!$', '!$.', '!$: default handler causes onboundary');
        testHistexp('!!', '!!.', '!!: default handler causes onboundary');
        lex.onPreviousCommand = function () {
            ctx += 'PREVIOUS COMMAND';
        };
        lex.onPreviousLastArg = function () {
            ctx += "LAST ARG";
        };
        testHistexp('foo !$', 'foo.LAST ARG.', '!$ causes onPreviousLastArg event');
        testHistexp('x !! y', 'x.PREVIOUS COMMAND.y.', '!! causes onPreviousCommand event');
        testHistexp('x!$y', 'xLAST ARGy.', 'in-word !$ does not cause onboundary');
        testHistexp('x!!y', 'xPREVIOUS COMMANDy.', 'in-word !! does not cause onboundary');
        testHistexp('!$', 'LAST ARG.', 'bare !$ causes onboundary');
        testHistexp('!!', 'PREVIOUS COMMAND.', 'bare !! causes onboundary');
    });

    test("lexer: word boundaries", function () {
        var lex = new lexer.Lexer();
        var boundaries;
        lex.oninit = function () {
            boundaries = undefined;
        };
        lex.onboundary = function (start, end) {
            boundaries = start + " -- " + end;
        };
        function testBoundaries(str, expected, comment) {
            lex.parse(str);
            equal(boundaries, expected, comment);
        }
        testBoundaries(" a ", "1 -- 2", "simple word");
        testBoundaries(" a", "1 -- 2", "word at end of input");
        testBoundaries("a", "0 -- 1", "word at start of input");
        testBoundaries("    ", undefined, "no word");
        testBoundaries(" 'a' ", "1 -- 4", "quoted word");
        testBoundaries(" '' ", "1 -- 3", "empty quotes");
        testBoundaries(" '''''''' ", "1 -- 9", "many empty quotes");
        testBoundaries(" ''a'' ", "1 -- 6", "surrounding empty quotes");
        testBoundaries(" \\' ", "1 -- 3", "escape char");
        testBoundaries(" a\\ b ", "1 -- 5", "escaped space not a boundary");
    });

    test("lexer: semi-colon (;)", function () {
        var lex = new lexer.Lexer();
        var ctx;
        lex.oninit = function () {
            ctx = '';
        };
        lex.onliteral = function (c) {
            ctx += c;
        };
        lex.onboundary = function () {
            ctx += '.';
        };
        function testSemicolon(str, expected, comment) {
            lex.parse(str);
            equal(ctx, expected, comment);
        }
        testSemicolon("foo ; bar", "foo.bar.", "; default handler is a NOP");
        testSemicolon("zoo;zar", "zoo.zar.", "; default handler causes onboundary");
        lex.onsemicolon = function () {
            ctx += "SEMICOLON";
        };
        testSemicolon("foo ; bar", "foo.SEMICOLONbar.", "onsemicolon event");
        testSemicolon(";", "SEMICOLON", "bare semi-colon, no onboundary");
        testSemicolon("a;b", "a.SEMICOLONb.", "no spaces around semi-colon");
    });

    test("lexer: errors", function () {
        var lex = new lexer.Lexer();
        var e;
        lex.onerror = function (x) {
            e = x;
        };
        function testError(txt, type) {
            var lead = "parsing <" + txt + "> ";
            lex.parse(txt);
            ok(e instanceof Error, lead + "yields Error object");
            equal(e.name, "ParseError",  lead + "yields ParseError");
            equal(e.type, type, lead + "yields expected error type");
        }
        ok(lexer.ERRCODES.UNBALANCED_SINGLE_QUOTE !== undefined &&
           lexer.ERRCODES.UNBALANCED_DOUBLE_QUOTE !== undefined &&
           lexer.ERRCODES.TERMINATING_BACKSLASH !== undefined &&
           lexer.ERRCODES.BARE_EXCLAMATIONMARK !== undefined,
           "expected error codes are defined");
        testError('what is "that?', lexer.ERRCODES.UNBALANCED_DOUBLE_QUOTE);
        testError("it's a monster!!!", lexer.ERRCODES.UNBALANCED_SINGLE_QUOTE);
        testError("/o\\", lexer.ERRCODES.TERMINATING_BACKSLASH);
        testError("Hey!", lexer.ERRCODES.BARE_EXCLAMATIONMARK);
    });

    test("history expander", function () {
        var hexp = new HistoryExpander();
        equal(
            hexp.expand("a !$ b !! c"),
            "a  b  c",
            "empty history expands to empty strings");
        hexp.setlast("foo bar");
        equal(
            hexp.expand("hello !$ goodbye"),
            "hello bar goodbye",
            "!$ is expanded to the last argument");
        equal(
            hexp.expand("hello !! goodbye"),
            "hello foo bar goodbye",
            "!! is expanded to the last command");
        hexp.setlast("latertater");
        equal(
            hexp.expand("!$"),
            "latertater",
            "setlast overwrites previous command");
        equal(
            hexp.expand("foo!$bar"),
            "foolatertaterbar",
            "concatenated with string literals on either side");
        equal(
            hexp.expand("!$ '!$' \"!$\" '!'$ \\!$"),
            "latertater '!$' \"!$\" '!'$ \\!$",
            "quoted variants not expanded");
        hexp.setlast("some weird\"mixed\"quo'te's\\ ");
        equal(
            hexp.expand("!$"),
            "weird\"mixed\"quo'te's\\ ",
            "Save quote style");
    });

    test("parser", function () {
        var parser = new Parser();
        parser.parse('le batman');
        ok(parser.ctx.firstast instanceof Ast, "parser yields an AST");
        var ast = parser.ctx.firstast;
        deepEqual(ast.argv, ["le", "batman"], "Ast contains parse results");
        // TODO: expand
    });

    test("parser: globbing", function () {
        function glob(pattern) {
            if (pattern !== '*.c') {
                ok(false, "unexpected glob pattern: " + pattern);
                return [];
            }
            return ["foo.c", "bar.c"];
        }
        var parser = new Parser(glob);
        parser.parse('ls *.c Makefile');
        ok(parser.ctx.firstast instanceof Ast, "parser yields an AST");
        var ast = parser.ctx.firstast;
        deepEqual(ast.argv, ["ls", "foo.c", "bar.c", "Makefile"], "glob expanded in-place");
    });

    test("parser: unsupported syntax", function () {
        var parser = new Parser();
        expect(1);
        try {
            parser.parse("foo ; bar");
        } catch (e) {
            ok(true, "semi-colon unsupported");
        }
    });

    test("parser: !$ and !!", function () {
        var parser = new Parser();
        function assertAst(expected, comment) {
            deepEqual(parser.ctx.firstast.argv, expected.split(' '), comment);
        }
        parser.parse('x !! y !$ z');
        assertAst('x y z', 'History expansions empty on first command');
        parser.parse('one two three');
        parser.commit();
        parser.parse('foo !$ bar');
        assertAst("foo three bar", "!$ is previous last argument");
        parser.parse('x !! y');
        assertAst("x one two three y", "!! is entire previous command");
        parser.parse('!$');
        assertAst("three", "!$ also works as cmd");
        parser.parse('foo');
        parser.commit();
        parser.parse('bar');
        parser.parse('echo !!');
        assertAst("echo foo", "history not overwritten without .commit()");
        parser.commit();
        parser.parse('echo !!');
        assertAst("echo echo foo", "history expansion is recursive");
    });

    // Mock (websocket) control line to server
    function buildMockCtrl(handlers) {
        return {
            send: function () {
                var argv = Array.prototype.slice.call(arguments);
                // normal send
                if (argv.length == 1) {
                    // needs at least 1 argument
                    argv.push("");
                }
                var h = handlers[argv[0]];
                if (h) {
                    h(argv.slice(1));
                } else {
                    throw "websocket event not in mock: " + argv[0];
                }
            },
        };
    }

    var uniqueIds = 0;
    function buildMockCommand(init, callback) {
        // simulate server-side websocket event handlers
        var handlers = {
            setprop: function (reqjson) {
                var req = JSON.parse(reqjson);
                cmd.processUpdate(req);
            }
        };
        if (!init.nid) {
            init.nid = ++uniqueIds;
        }
        var ctrl = buildMockCtrl(handlers);
        var cmd = new Command.Command(ctrl, init, "foo");
        if (callback) {
            callback(cmd);
        } else {
            return cmd;
        }
    }

    test("command update events", function () {
        var cmd = buildMockCommand({nid: 1, name: "echo"});

        // Setting up the callbacks
        var updatedNameEventCount = 0;
        var updatedArgsEventCount = 0;
        // a jquery event for just this property: updated.name
        cmd.on(Command.UpdatedNameEvent, function (e) {
            var by = e.from;
            updatedNameEventCount++;
            equal(by, "batman", "updated.name handler passed 'by' param");
        });
        // a jquery event for a property that was not updated
        cmd.on(Command.UpdatedArgsEvent, function (e) {
            updatedArgsEventCount++;
        });
        
        // Perform the update
        var oldCmdCopy = $.extend({}, cmd);
        var updata = {name: "echo 2"};
        cmd.update(updata, "batman");

        // Verify the effects
        equal(cmd.name, "echo 2", "name property on command is updated");
        equal(updatedNameEventCount, 1, "updated.name event triggered once");
        equal(updatedArgsEventCount, 0, 'updated.args event not triggered');
        // this is how you expect updating to work
        var updatedWithSimpleSemantics = $.extend({}, oldCmdCopy, updata);
        // poor man's deepEqual, works better for some reason that I don't care
        // about
        equal(JSON.stringify(cmd), JSON.stringify(updatedWithSimpleSemantics),
                "No extra fluff is introduced by command updating");

        cmd.update(updata, "batman");
        equal(updatedNameEventCount, 1, "ignore update() with NOP semantics");
    });

    test("command update callbacks", function () {
        var cmd = buildMockCommand({nid: 7, name: "goku"});
        var i = 0;
        cmd.update({name: "krillin"}, "the universe", function (cmdarg) {
            equal(cmdarg, cmd, "command instance passed to callback equals original command");
            i += 1;
        });
        equal(i, 1, "callback passed to update method called");
        cmd.update({name: "still krillin", args: ["something something darkside"]},
                   "Merkel", function (_, by) {
            equal(by, "Merkel", "by passed to callback");
            i += 1;
        });
        equal(i, 2, "callback function called exactly once per update");
        cmd.update({name: "still krillin"}, "", function () { i += 1; });
        equal(i, 3, "callback function also called when no properties are updated");
    });

    test("stream events", function () {
        var cmd = buildMockCommand({nid: 1, name: "echo"});

        var stdoutData = [];
        var stderrData = [];
        var stdout, stderr;
        cmd.on(Command.StreamStdoutEvent, function (e) {
            stdoutData.push(e.data);
        });
        cmd.on(Command.StreamStderrEvent, function (e) {
            stderrData.push(e.data);
        });
        cmd.on(Command.UpdatedStdoutEvent, function (e) {
            stdout = e.stdout;
        });
        cmd.on(Command.UpdatedStderrEvent, function (e) {
            stderr = e.stderr;
        });

        cmd.processStream('stdout', 'first out, ');
        cmd.processStream('stderr', 'then err');
        cmd.processStream('stdout', 'more out');

        deepEqual(stdoutData, ['first out, ', 'more out'], "stdout.stream events for every stdout data");
        deepEqual(stderrData, ['then err'], "stderr.stream events for every stderr data");
        equal(stdout, "first out, more out", 'updated.stdout event for full stdout data');
        equal(stderr, "then err", 'updated.stderr event for full stderr data');
        equal(stdout, cmd.stdout, "updated.stdout event data and cmd.stdout member in sync");
        equal(stderr, cmd.stderr, "updated.stderr event data and cmd.stderr member in sync");
    });

    test("pool", function () {
        var testar = [];
        var consumer = function (x) { testar.push(x); };
        var pool = new Pool();
        pool.add(1);
        pool.consume(consumer);
        deepEqual(testar, [1], "consume from non-empty pool");
        pool.consume(consumer);
        pool.add(2);
        deepEqual(testar, [1,2], "consume from empty pool, then add element");
    });

    asyncTest("command-line interface model", function () {
        expect(15);
        var cli = new Cli(buildMockCommand);
        var updatedPrompt;
        cli.onUpdatedPrompt = function (txt) {
            equal(typeof txt, "string", "prompt updated with string");
            updatedPrompt = txt;
        };
        var errmsg;
        cli.setprompt("one two three").then(function () {
            ok(cli._cmd instanceof Command.Command, "synchronized command with prompt");
            equal(cli._cmd.cmd, "one", "command name of synced command");
            deepEqual(cli._cmd.args, ["two", "three"], "args of synced command");
            ok(!cli._cmd.stdoutto, "synced command has no child");
            var def = $.Deferred();
            cli._cmd.update({args: ["tzö", "tzree"]}, "lebatman", function () {
                def.resolve(); // let's settle this, batman
            })
            return def;
        }).then(function () {
            // you know what's a good movie? that one movie about the cop that
            // tu--Prince Of The City! that's the name. great movie. people say
            // it's too long but I think it's great. good dialogues.
            equal(updatedPrompt, "one tzö tzree", "updating synced command syncs prompt");
            return cli.setprompt("blabla");
        }).then(function () {
            equal(cli._cmd.cmd, "blabla", "updated entire prompt: command");
            deepEqual(cli._cmd.args, [], "updated entire prompt: args");
            return cli.setprompt("parse 'error");
        }).then(function () {
            throw "parse error didn't reject deferred!";
        }, function (e) {
            ok(e instanceof Error, "deferred returned by setprompt() rejected with Error on parse error");
            equal(e.name, "ParseError", "error instance is a ParseError");
            equal(cli._cmd.cmd, "blabla", "parse error doesn't affect old command");
            return cli.setprompt("parse 'error", true);
        }).then(function () {
            equal(cli._cmd.cmd, "parse", "parse error ignored");
            deepEqual(cli._cmd.args, ["error"], "ignored parse error doesn't affect output");
            return cli.setprompt("parse 'error");
        }).then(function () {
            throw "repeated parse error didn't reject deferred!";
        }, function (e) {
            ok(true, "alternating ignoreErrors parameter does not spoil cache");
            return cli.setprompt("echo monk");
        }).then(function () {
            var d = $.Deferred();
            cli.complete(function (name) {
                d.resolve(name);
            });
            return d;
        }).then(function (name) {
            equal(name, "monk", "tab completion");
            return cli.setprompt("foodoofafa | haia | parapapapa");
        }).then(function () {
            // ... wait---how do I test this?
            // TODO: test pipeline
            // TODO: start the cmd through the cli (also icm w pipeline)
            // TODO: start the cmd externally
            // TODO: start random command in a synced pipeline
            // &c! (Cli object is friggin' complex man)
        }).always(start); // qunit
    });

    asyncTest("U.pipeDeferred: success", function () {
        expect(1);
        var d1 = $.Deferred();
        var d2 = $.Deferred().done(function (x, y) {
            equal(x * y, 15, "pass arguments to success handler");
        }).fail(function () {
            throw "failure handler called";
        }).always(function () { start(); });
        U.pipeDeferred(d1, d2);
        d1.resolve(3, 5);
    });

    asyncTest("U.pipeDeferred: failure", function () {
        expect(1);
        var d3 = $.Deferred().reject(2, 10);
        var d4 = $.Deferred().done(function () {
            throw "success handler called";
        }).fail(function (x, y) {
            equal(x * y, 20, "pass arguments to failure handler");
        }).always(function () { start(); });
        U.pipeDeferred(d3, d4);
    });

    asyncTest("U.noConcurrentCalls()", function () {
        expect(6);
        var stack = "";
        function push(c, crash) {
            var d = $.Deferred();
            setTimeout(function () {
                stack += c;
                if (crash) {
                    d.reject("crashed");
                } else {
                    d.resolve(stack);
                }
            }, 10);
            return d;
        }
        var f = U.noConcurrentCalls(push);
        f("a").done(function (j) {
            equal(stack, "a", "first deferred done before pending call");
            equal(stack, j, "argument passed to direct success handler");
        });
        f("b");
        f("c").always(function () {
            throw "I should have been overwritten";
        });
        f("d");
        f("e");
        f("f").then(function (k) {
            equal(stack, "af", "only one pending function at a time");
            equal(stack, k, "argument passed to delayed success handler");
            f("g", true).fail(function (msg) {
                equal(msg, "crashed", "rejecting original deferred rejects wrapped deferred");
            });
            f("h", true).always(function () {
                throw "I should have been overwritten";
            });
            f("i", true);
            return f("j");
        }).then(function () {
            equal(stack, "afgj", "running wrapped function crash does not prevent pending call");
        }).always(function () { start(); });
    });

    asyncTest("U.mapf", function () {
        expect(2);
        // 1536 = 3 * 2^9
        var last;
        var str = "";
        U.mapf(function (i) {
            last = i;
            return $.Deferred().resolve();
        }, 1536, function (i) { if (i % 2 == 0) return i / 2; })
        .then(function () {
            equal(last, 3, "last call was on first odd number");
            return U.mapf(function (s) {
                str += s[0];
                return $.Deferred().resolve();
            }, "abcd", function (s) { return s.substr(1) || undefined; }, true);
        }, function () {
            throw "deferred should have completed succesfully"
        }).done(function () {
            equal(str, "dcba", "reverse order flag respected");
        }).always(function () { start(); });
    });

    test("U.isInt", function () {
        ok(U.isInt(1), "1 is integer");
        ok(U.isInt(1.0), "1.0 is integer (oh, javascript...)");
        ok(!U.isInt(1.5), "1.5 is not integer");
        ok(!U.isInt("foo"), '"foo" is not integer');
        ok(!U.isInt("1"), '"1" is not integer');
        ok(!U.isInt(NaN), "NaN is not integer");
        ok(!U.isInt(Infinity), "Infinity is not integer");
        ok(U.isInt(-3), "-3 is integer");
    });
});
