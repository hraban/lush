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


// Model for the command line interface. Conventions in this file:
//
// - all updates to a command object MUST specify the GUID of the CLI as the by
// parameter.
//
// - all (jQuery) event handlers hooked to a command object MUST be specified in
// the .terminal namespace.

"use strict";

define(["jquery",
        "lush/Ast",
        "lush/Command",
        "lush/Parser",
        "lush/Pool",
        "lush/utils"],
       function ($, Ast, Command, Parser, Pool, U) {

    // Manage context of a command line interface. purely conceptual, no UI.
    // processCmd arg is a function, called by the cli to actually invoke a
    // command (after parsing etc).
    //
    // Requires a function to be tacked on before use: .onUpdatedPrompt. Will be
    // called with a string as the argument every time a command is changed from
    // the outside. The argument is the new command prompt.
    //
    // requires ANOTHER function to be tacked on: .onerror. is passed an error
    // string as the first argument whenever one arises.
    //
    // This model is constantly updated by a terminal with the latest user input
    // (the prompt), live as the user types. The cli model will parse the
    // prompt, live, and allocate command objects as necessary. These command
    // objects are synchronized with the prompt: if the prompt changes, the
    // command objects are updated (by the cli model). If any of the command
    // objects change, the onUpdatedPrompt function is called with the new
    // prompt string.
    //
    // why not jQuery events? because this is simpler, and because it causes an
    // error if caller forgets to set the callbacks.
    var Cli = function (processCmd) {
        var cli = this;
        // Locally identify this specific command line
        cli._guid = U.guid();
        cli._processCmd = processCmd;
        cli._parser = new Parser();
        // Prepared commands pool for quicker turn-around after hitting enter
        cli._cmdpool = new Pool();
        // Pre-fetch five commands for the pool
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        // a Deferred that resolves when the command tree is synced with the
        // latest call to setprompt()
        cli._syncingPrompt = $.Deferred().resolve();
        cli._setprompt_safe = U.noConcurrentCalls(cli._setprompt_aux.bind(cli));
        // Event unbinders
        cli._offs = [];
    };

    // ask the server for a new command and put it in "CLI mode"
    Cli.prototype._prefetchCmd = function () {
        var cli = this;
        var options = {
            userdata: {
                // set to false once command is taken out of pool
                unused: true,
                // set to false once command starts being used
                archived: true,
                creator: "prompt",
            }
        };
        cli._processCmd(options, function (cmd) {
            cli._cmdpool.add(cmd);
        });
    };

    // Ask server for a "CLI mode" command. Returns a Deferred which will be
    // passed the command when it is received. Returns a resolved Deferred if
    // the command pool is populated.
    Cli.prototype._getCmdFromPool = function () {
        var cli = this;
        var def = $.Deferred();
        cli._prefetchCmd();
        cli._cmdpool.consume(function (cmd) {
            cli._prepareCmdForSync(cmd);
            def.resolve(cmd);
        });
        return def;
    };

    // propagate changes in the prompt to the given cmd tree.
    //
    // returns a Deferred that will be called with a (possibly fresh) cmd object
    // for this ast when the command and its entire subtree has been updated.
    //
    // this method is so messed up..
    //
    // split off to a non-method function to make it very clear that this does
    // not change the CLI object internally; responsibility is really with the
    // caller to handle the resulting command.
    function syncPromptToCmd(ast, cmd, updateGUID, getCmd) {
        // sanity checks
        if (ast !== undefined && !(ast instanceof Ast)) {
            throw new Error("Illegal ast node");
        }
        if (cmd !== undefined && !(cmd instanceof Command.Command)) {
            throw new Error("Illegal command object");
        }
        if (!$.isFunction(getCmd)) {
            throw new Error("syncPromptToCmd needs a callable getCmd parameter");
        }

        if (cmd === undefined && ast === undefined) {
            // perfect! don't touch anything.
            return $.Deferred().resolve(undefined);
        } else if (cmd === undefined) {
            // no command object associated with this level yet. request a new
            // one and retry
            return getCmd().then(function (cmd) {
                return syncPromptToCmd(ast, cmd, updateGUID, getCmd);
            });
        } else if (ast === undefined) {
            // the pipeline used to contain more commands.  the user changed his
            // mind and removed one (or more). many things can be done with the
            // pre-allocated but now-unnecessary command objects, but by far the
            // easiest is to just ditch them all. this is easy to understand for
            // the user, easy to program and wasteful of resources (there is
            // probably a choose-2 joke there).
            //
            // so.
            //
            // clean up the mess once this command is detached from its parent.
            // can't clean up earlier because a child must exist at the moment
            // of detaching.
            cmd.one(ParentRemovedEvent, function (e) {
                var cmd = e.cmd;
                U.mapCmdTree(cmd, function (cmd) { cmd.release(); });
            });
            // inform the parent that his child died (hopefully he will
            // disconnect) (otherwise we're in trouble)
            return $.Deferred().resolve(undefined, "so sorry for your loss");
        } else {
            // update an existing synced command object
            // TODO: Can be merged in continuation, only makes sense when
            // setprops ws event exists
            cmd.update({
                cmd: ast.argv[0] || "",
                args: ast.argv.slice(1),
                name: ast.getName(),
                // only mark as used once the user actually types something in
                // the prompt. don't worry about race conditions: as long as
                // this session is in the server's allclients set this command
                // won't be pruned.
                userdata: {
                    unused: false,
                    archived: false,
                }
            }, updateGUID);
            // continue to the children
            return syncPromptToCmd(ast.stdout, cmd.stdoutCmd(), updateGUID, getCmd).then(function (outChild) {
                // the subtree has been synced, update me
                var stdoutto;
                // outChild is a new child for stdoutto
                if (outChild === undefined) {
                    stdoutto = 0;
                } else {
                    stdoutto = outChild.nid;
                }
                var def = $.Deferred();
                cmd.update({stdoutto: stdoutto}, updateGUID, function (cmd) {
                    // I have been synced, let my caller know
                    def.resolve(cmd);
                });
                return def;
            });
        }
        throw new Error("hraban done messed up"); // shouldnt reach
    }

    // Update the synchronized command tree to reflect changes to the prompt.
    // Returns a deferred that is resolved when the command tree is synced with
    // this prompt.
    Cli.prototype._syncPrompt = function (ast) {
        var cli = this;
        if (!(ast instanceof Ast)) {
            throw new Error("ast argument must be an Ast instance");
        }
        var doneDeferred = $.Deferred();
        var getCmd = function (x) {
            return cli._getCmdFromPool(x);
        }
        return syncPromptToCmd(ast, cli._cmd, cli._guid, getCmd).then(function (cmd) {
            if (cmd === undefined) {
                // not rejecting the Deferred here because this is a heavy
                // assert()-fail; don't expect anything to work anymore anyway.
                throw new Error("No root command parsed");
            }
            cli._cmd = cmd;
            // do not pass the command to the next handler
            return undefined;
        });
    };

    // Completely disconnect the current sync between CLI and command tree.
    Cli.prototype._disconnectTree = function () {
        var cli = this;
        // by disconnecting the root of this tree from the cli the
        // updates to the cli cannot be propagated to the commands
        // anymore. an update causes a search for the ._cmd, if that
        // is not found an entirely new tree is created.
        cli._cmd = undefined;
        var offs = this._offs;
        // Clear this first so exceptions in off functions only occur once
        this._offs = [];
        offs.forEach(function (f) { f(); });
    };

    // (One-way) sync a command to this cli object: cmd changes -> update me.
    Cli.prototype._monitorCommandChanges = function (cmd) {
        var cli = this;
        // when the associated command (args or cmd) is updated from outside
        var evs = [Command.UpdatedArgsEvent, Command.UpdatedCmdEvent];
        cli._offs.push(cmd.onany(evs, function (e) {
            var cmd = e.cmd;
            if (e.from == cli._guid || e.from == 'init') {
                // ignore init and myself
                return;
            }
            var newprompt = U.cmdChainToPrompt(cli._cmd);
            // not a jQuery event because I want to crash if unhandled
            cli.onUpdatedPrompt(newprompt);
        }));
        cli._offs.push(cmd.on(Command.UpdatedStatusEvent, function (e) {
            var cmd = e.cmd;
            // if currently bound command is started
            if (cmd.status.code > 0) {
                var root = cmds[cmd.getGid()];
                if (root !== cli._cmd) {
                    // Tree is already disconnected: ignore and wait until event
                    // handler is unbound.
                    return;
                }
                // this command is (part of) the synchronised command tree what
                // now? that is the big question. what now. take a step back and
                // look at the situation. the user types:
                //
                // find -name '*.[ch]' -print0 | xargs -0 cat | wc -l
                //
                // without commiting (hitting enter). this consumes three
                // command objects from the pre-allocation pool and sets them up
                // in line with the prompt.
                //
                // now, he (or somebody / something else) starts the xargs
                // command asynchronously, through the widget. what do we do
                // with the prepared commands? with the prompt? can't just leave
                // it hanging around like that; if he changes the sort command
                // in the prompt this causes an update to the argv of a running
                // command---a client error.
                //
                // the easiest thing to do here, by far, is to just flush the
                // entire tree of prepared commands and start again.  it's not
                // (at all) what the user expects, unfortunately.
                cli._disconnectTree();
            }
        }));
    };

    // When a command is synced with this CLI certain bookkeeping applies: if
    // the command is ever updated from the outside, the CLI must know! How? By
    // hooking to every (significant) update, checking who caused the update,
    // and taking appropriate action.
    Cli.prototype._prepareCmdForSync = function (cmd) {
        var cli = this;
        if (!(cmd instanceof Command.Command)) {
            throw new Error("Argument to _prepareCmdForSync must be a Command");
        }
        // Sneaky integrity check
        if (cmd._prepareCmdForSyncSanityCheck !== undefined) {
            throw new Error("_prepareCmdForSync already called on this command");
        }
        cmd._prepareCmdForSyncSanityCheck = true;
        cli._monitorCommandChanges(cmd);
    };

    // the user updated the prompt: call this method to notify the cli object.
    // what will the cli object do? that is the topic of tonight's "hraban
    // writes documentation".
    //
    // 1. it will PARSE the input, transforming a STRING into an AST (see Ast
    // class for info on that structure).
    //
    // 2. it will take that AST and synchronize it to the "synced commands",
    // reflecting the changes to the command line in the corresponding widgets.
    //
    // 3. it will do everything on hraban's todo list, freeing up his day for
    // happy times.
    //
    // :(
    //
    // if ignoreParseError is true parse errors will be ignored when updating
    // the synced commands.
    //
    // beware: this function uses noConcurrentCalls thus, if called
    // concurrently, returns deferreds that are never resolved nor rejected.
    Cli.prototype.setprompt = function (txt, ignoreParseError) {
        var cli = this;
        return cli._setprompt_safe(txt, ignoreParseError);
    };

    // bare version of setprompt (no locking)
    Cli.prototype._setprompt_aux = function (txt, ignoreParseError) {
        var cli = this;
        if (!(typeof txt == "string")) {
            throw new Error("argument to setprompt must be the raw prompt, as a string");
        }
        cli._latestPromptInput = txt;
        // this specific syncing job (will be rejected on error)
        var d = $.Deferred();
        var ast;
        try {
            ast = cli._parser.parse(txt, ignoreParseError);
        } catch (e) {
            return d.reject(e);
        }
        U.pipeDeferred(cli._syncPrompt(ast), d);
        return d;
    };

    // commit the current prompt ([enter] button)
    Cli.prototype.commit = function () {
        var cli = this;
        cli._parser.commit();
        if (!cli._cmd) {
            throw new Error("cmd not ready");
        }
        var root = cli._cmd;
        cli._cmd = undefined;
        // ++ for every cmd started, -- for every command that finishes, = -1
        // for any error. == 0? HOLY UNEXPECTED SWEETNESS! quick, archive it
        // before He changes His mind.
        var runningCmds = 0;
        // archive when everybody completes succesfully
        var cmdDone = function (e) {
            var cmd = e.cmd;
            if (e.status.code == 2) {
                // success!
                runningCmds -= 1;
            } else {
                // ohnoes!
                // setting to -1 will prevent the counter from ever reaching 0
                runningCmds = -1;
                $('.promptcopy-' + cmd.nid).addClass('failure');
                cli.onerror(e.status.err);
            }
            if (runningCmds == 0) {
                $('.promptcopy-' + cmd.nid).addClass('success');
                // all commands in this pipeline have completed succesfully
                root.setArchivalState(true);
            }
        };
        // huge hack around jQuery.terminal: get the div containing a copy of
        // the prompt that spawned this command, which, we hope, is now the last
        // non-output div in the list.  trivia: :last-child doesn't work here
        // because that's a DOM property, not a filter on css result sets (I
        // think)
        var $promptcpy = $('.terminal-output > div:not([class*=output])').last();
        return cli._syncingPrompt.done(function () {
            // when the prompt has been set, all commands can be started.
            U.mapCmdTree(root, function (cmd) {
                $promptcpy.addClass('promptcopy-' + cmd.nid);
                cmd.start();
                runningCmds += 1;
                cli._offs.push(cmd.one(Command.DoneEvent, cmdDone));
            });
        });
    };

    // user hit <tab>. assumes pointer is at end of input, as previously set
    // with setprompt(). oo! bery easy!
    Cli.prototype.complete = function (filenameCallback) {
        var cli = this;
        var cmd = cli._cmd;
        if (!cmd) {
            // TODO: prettier
            throw new Error("cmd not ready for tab completion");
        }
        var argv = cli._parser.ctx.ast.argv;
        if (argv.length < 2) {
            // only works on filenames
            // TODO: also on executables plz
            return;
        }
        filenameCallback(argv.pop());
    };

    return Cli;
});
