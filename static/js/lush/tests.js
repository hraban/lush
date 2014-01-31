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
        "lush/Lexer",
        "lush/Parser",
        "lush/Pool",
        "lush/utils"],
       function ($, Ast, Cli, Command, Lexer, Parser, Pool) {

    test("lcp(): longest common prefix", function () {
        equal(lcp(["abcd", "abab", "abba"]), "ab");
        equal(lcp([]), "", "common prefix of 0 strings");
        equal(lcp(["foo", "bar"]), "");
        equal(lcp(["", "foo"]), "");
        equal(lcp(["burt", "burt"]), "burt");
    });

    test("splitn(): split string with limit", function () {
        deepEqual("a,b,c,d".splitn(",", 3), ['a', 'b', 'c,d']);
        deepEqual("a,b,c,d".splitn(",", 9), ['a', 'b', 'c', 'd']);
        deepEqual("a,b,c,d".splitn(",", 1), ['a,b,c,d']);
        deepEqual("foo".splitn("", 2), ['f', 'oo']);
        deepEqual("".splitn(",", 1), [""]);
        deepEqual("".splitn("", 1), []);
    });
    
    test("lexer: argv", function() {
        // parsing context
        var ctx;
        var lexer = new Lexer();
        // parse a new sentence
        lexer.oninit = function () {
            ctx = {
                newarg: '',
                argv: [],
            };
        };
        // a wild character appeared! add it to the current word
        lexer.onliteral = function (c) {
            ctx.newarg += c;
        };
        // all literals found up to here: you are considered a word
        lexer.onboundary = function () {
            ctx.argv.push(ctx.newarg);
            ctx.newarg = '';
        };
        var t = function (raw, out, name) {
            lexer.parse(raw);
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
        var lexer = new Lexer();
        lexer.oninit = function () {
            ctx = {
                newarg: '',
                argv: [],
            };
        };
        lexer.onliteral = function (c) {
            ctx.newarg += c;
        };
        lexer.onglobQuestionmark = function () {
            ctx.newarg += 'GLOB_QM';
        };
        lexer.onglobStar = function () {
            ctx.newarg += 'GLOB_STAR';
        };
        lexer.onboundary = function () {
            ctx.argv.push(ctx.newarg);
        };
        var t = function (raw, out, name) {
            lexer.parse(raw);
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
        var lexer = new Lexer();
        lexer.oninit = function () {
            ctx = {
                newarg: '',
                argv: [],
            };
        };
        // a wild character appeared! add it to the current word
        lexer.onliteral = function (c) {
            ctx.newarg += c;
        };
        // got a *
        lexer.onglobStar = function (idx) {
            ctx.gotstar = idx;
        };
        // got a ?
        lexer.onglobQuestionmark = function (idx) {
            ctx.gotquestionmark = idx;
        };
        lexer.onglobChoice = function (choices, idx) {
            ctx.gotchoice = choices;
        };
        lexer.parse('*');
        strictEqual(ctx.gotstar, 0, 'indexed wildcard: * (0)');
        lexer.parse('foo*bar');
        strictEqual(ctx.gotstar, 3, 'indexed wildcard: * (3)');
        lexer.parse('?');
        strictEqual(ctx.gotquestionmark, 0, 'indexed wildcard: ?');
        lexer.parse('?*');
        strictEqual(ctx.gotquestionmark, 0, 'indexed wildcards: ?');
        strictEqual(ctx.gotstar, 1, 'indexed wildcards: *');
        // Not implemented yet
        //lexer.parse('[abc]');
        //deepEqual(ctx.gotchoice, ['a', 'b', 'c'], 'wildcard choice: [abc]');
    });

    test("lexer: pipe syntax", function() {
        var ctx;
        var lexer = new Lexer();
        lexer.oninit = function () {
            ctx = {
                newarg: '',
            };
            ctx.cur_argv = [];
            ctx.all_argv = [ctx.cur_argv];
        };
        lexer.onliteral = function (c) {
            ctx.newarg += c;
        };
        lexer.onboundary = function () {
            ctx.cur_argv.push(ctx.newarg);
            ctx.newarg = '';
        };
        lexer.onpipe = function () {
            ctx.cur_argv = [];
            ctx.all_argv.push(ctx.cur_argv);
        };

        lexer.parse('trala blabla');
        deepEqual(ctx.all_argv, [["trala", "blabla"]], "no pipe");

        lexer.parse('echo foobar | cat');
        deepEqual(ctx.all_argv, [["echo", "foobar"], ["cat"]], "pipe once");

        lexer.parse('abc | yeye | ohno!');
        deepEqual(ctx.all_argv, [["abc"], ["yeye"], ["ohno!"]], "pipe twice");

        lexer.parse('lookma|nospaces');
        deepEqual(ctx.all_argv, [["lookma"], ["nospaces"]], "no spaces around pipe");
    });

    test("lexer: errors", function () {
        var lexer = new Lexer();
        var e;
        lexer.onerror = function (x) {
            e = x;
        };
        function testError(txt, type) {
            var lead = "parsing <" + txt + "> ";
            lexer.parse(txt);
            ok(e instanceof Error, lead + "yields Error object");
            equal(e.name, "ParseError",  lead + "yields ParseError");
            equal(e.type, type, lead + "yields expected error type");
        }
        ok(Lexer.ERRCODES.UNBALANCED_SINGLE_QUOTE !== undefined &&
           Lexer.ERRCODES.UNBALANCED_DOUBLE_QUOTE !== undefined &&
           Lexer.ERRCODES.TERMINATING_BACKSLASH !== undefined,
           "expected error codes are defined");
        testError('what is "that?', Lexer.ERRCODES.UNBALANCED_DOUBLE_QUOTE);
        testError("it's a monster!!!", Lexer.ERRCODES.UNBALANCED_SINGLE_QUOTE);
        testError("/o\\", Lexer.ERRCODES.TERMINATING_BACKSLASH);
    });

    test("parser", function () {
        var parser = new Parser();
        parser.parse('le batman');
        ok(parser.ctx.firstast instanceof Ast, "parser yields an AST");
        var ast = parser.ctx.firstast;
        deepEqual(ast.argv, ["le", "batman"], "Ast contains parse results");
        // TODO: expand
    });

    // TODO: obsolete!
    (function () { test("groupname: pipe notation", function () {
        var C = function (name) {
            this.name = name;
        }
        C.prototype.child = function (name) {
            return this[name];
        }
        // eventual structure:
        //
        // c -- co  -- coo -- cooo
        // |            |
        // ce          cooe
        // |
        // cee
        //
        var c = new C('c');
        equal(groupname(c), 'c', 'single command')
        var co = new C('co');
        c.stdout = co;
        equal(groupname(c), 'c | co', 'one pipe')
        var ce = new C('ce');
        c.stderr = ce;
        equal(groupname(c), 'c | co 2| ce', 'stdout & stderr');
        var coo = new C('coo');
        co.stdout = coo;
        // test simpler pipe first
        c.stderr = undefined;
        equal(groupname(c), 'c | co | coo', 'long stdout only pipe');
        // restore
        c.stderr = ce;
        equal(groupname(c), 'c | (co | coo) 2| ce', 'nested stdout pipe')
        var cooo = new C('cooo');
        coo.stdout = cooo;
        equal(groupname(c), 'c | (co | coo | cooo) 2| ce', 'nested long pipe')
        var cooe = new C('cooe');
        coo.stderr = cooe;
        equal(groupname(c), 'c | (co | coo | cooo 2| cooe) 2| ce',
                'nested stdout & stderr')
        var cee = new C('cee');
        ce.stderr = cee;
        equal(groupname(c), 'c | (co | coo | cooo 2| cooe) 2| ce 2| cee',
            'chained stderr')
    }); });

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
        var cmd = new Command(ctrl, init, "foo");
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
        $(cmd).on('updated.name', function (e, by) {
            updatedNameEventCount++;
            equal(by, "batman", "updated.name handler passed 'by' param");
        });
        // a jquery event for a property that was not updated
        $(cmd).on('updated.args', function (e, name) {
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
        $(cmd).on('stdout.stream', function (e, data) {
            stdoutData.push(data);
        }).on('stderr.stream', function (e, data) {
            stderrData.push(data);
        }).on('updated.stdout', function (e, data) {
            stdout = data;
        }).on('updated.stderr', function (e, data) {
            stderr = data;
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
            ok(cli._cmd instanceof Command, "synchronized command with prompt");
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

    asyncTest("pipeDeferred: success", function () {
        expect(1);
        var d1 = $.Deferred();
        var d2 = $.Deferred().done(function (x, y) {
            equal(x * y, 15, "pass arguments to success handler");
        }).fail(function () {
            throw "failure handler called";
        }).always(function () { start(); });
        pipeDeferred(d1, d2);
        d1.resolve(3, 5);
    });

    asyncTest("pipeDeferred: failure", function () {
        expect(1);
        var d3 = $.Deferred().reject(2, 10);
        var d4 = $.Deferred().done(function () {
            throw "success handler called";
        }).fail(function (x, y) {
            equal(x * y, 20, "pass arguments to failure handler");
        }).always(function () { start(); });
        pipeDeferred(d3, d4);
    });

    asyncTest("noConcurrentCalls()", function () {
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
        var f = noConcurrentCalls(push);
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

    asyncTest("mapf", function () {
        expect(2);
        // 1536 = 3 * 2^9
        var last;
        var str = "";
        mapf(function (i) {
            last = i;
            return $.Deferred().resolve();
        }, 1536, function (i) { if (i % 2 == 0) return i / 2; })
        .then(function () {
            equal(last, 3, "last call was on first odd number");
            return mapf(function (s) {
                str += s[0];
                return $.Deferred().resolve();
            }, "abcd", function (s) { return s.substr(1) || undefined; }, true);
        }, function () {
            throw "deferred should have completed succesfully"
        }).done(function () {
            equal(str, "dcba", "reverse order flag respected");
        }).always(function () { start(); });
    });
});
