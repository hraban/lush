// Copyright © 2013 - 2016 Hraban Luyat <hraban@0brg.net>
//
// This source code is licensed under the AGPLv3. Details in the LICENSE file.


// Model for the command line interface.
//
// All updates to a command object MUST specify the GUID of the CLI as the by
// parameter: this allows the CLI to ignore "echo updates" when they come in a
// little later than they were sent. Not ignoring those will undo any changes
// made in the mean time.

/// <reference path="refs/jquery.d.ts" />

import * as $ from "jquery";
import Ast from "./Ast";
import globals from "./globals";
import * as Command from "./Command";
import Parser from "./Parser";
import Pool from "./Pool";
import * as U from "./utils";

// propagate changes in the prompt to the given cmd tree.
//
// returns a Deferred that will be called with a (possibly fresh) cmd object for
// this ast when the command and its entire subtree has been updated.
//
// this method is so messed up..
//
// split off to a non-method function to make it very clear that this does not
// change the CLI object internally; responsibility is really with the caller to
// handle the resulting command.
function syncPromptToCmd(ast: Ast, cmd: Command.Command, updateGUID: string, getCmd: { (): JQueryPromise<Command.Command>; }): JQueryPromise<Command.Command> {
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
        // Typescript gets confused about jQuery unwrapping promises
        return <any>getCmd().then(function (cmd) {
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
        cmd.one(Command.ParentRemovedEvent, function (e: Command.ParentRemovedEvent) {
            e.cmd.releaseGroup();
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
            userdata: <Command.Userdata>{
                unused: false,
                archived: false,
            }
        }, updateGUID);
        // continue to the children
        return <any>syncPromptToCmd(ast.stdout, cmd.stdoutCmd(), updateGUID, getCmd).then(function (outChild) {
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
    throw new Error("cannot reach");
}

// Manage context of a command line interface. purely conceptual, no UI.
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
export default class Cli {
    // Locally identify this specific command line Prepared commands pool for
    // quicker turn-around after hitting enter
    private _cmdpool = new Pool<Command.Command>();
    private _guid = U.guid();
    // Event unbinders
    private _offs: Function[] = [];
    private _parser = new Parser();
    private _setprompt_safe: (txt: string, ignoreErrors: boolean) => JQueryPromise<Command.Command>;
    // a Deferred that resolves when the command tree is synced with the latest
    // call to setprompt()
    // TODO ehh this seems somehow messed up---never actually not resolved?
    // Needs some investigation --2014-11-21
    private _syncingPrompt = $.Deferred().resolve();
    private _cmd: Command.Command;

    // TODO: private and arg to constructor
    onUpdatedPrompt: (s: string) => void;
    onerror: (msg: string) => void;

    // Arg is a "command creator", called by the cli to actually invoke a
    // command (after parsing etc). Second argument to that function is a
    // callback which it should call with the freshly created command, once
    // ready.
    constructor(private _processCmd: (init: any, callback?: (cmd: Command.Command) => void) => void) {
        var cli = this;
        // Pre-fetch five commands for the pool
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._prefetchCmd();
        cli._setprompt_safe = U.noConcurrentCalls((s, b) => cli._setprompt_aux(s, b));
    }

    // ask the server for a new command and put it in "CLI mode"
    private _prefetchCmd() {
        var cli = this;
        var options = {
            userdata: <Command.Userdata>{
                // set to false once command is taken out of pool
                unused: true,
                // set to false once command starts being used
                archived: true,
                creator: "prompt"
            }
        };
        cli._processCmd(options, function (cmd) {
            cli._cmdpool.add(cmd);
        });
    }

    // Ask server for a "CLI mode" command. Returns a Deferred which will be
    // passed the command when it is received. Returns a resolved Deferred if
    // the command pool is populated.
    private _getCmdFromPool(): JQueryPromise<Command.Command> {
        var cli = this;
        var def = $.Deferred<Command.Command>();
        cli._prefetchCmd();
        cli._cmdpool.consume(function (cmd) {
            cli._prepareCmdForSync(cmd);
            def.resolve(cmd);
        });
        return def;
    }

    // Update the synchronized command tree to reflect changes to the prompt.
    // Returns a deferred that is resolved when the command tree is synced with
    // this prompt.
    private _syncPrompt(ast: Ast): JQueryPromise<Command.Command> {
        var cli = this;
        if (!(ast instanceof Ast)) {
            throw new Error("ast argument must be an Ast instance");
        }
        var getCmd = () => cli._getCmdFromPool();
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
    }

    // Completely disconnect the current sync between CLI and command tree.
    private _disconnectTree() {
        var cli = this;
        // by disconnecting the root of this tree from the cli the
        // updates to the cli cannot be propagated to the commands
        // anymore. an update causes a search for the ._cmd, if that
        // is not found an entirely new tree is created.
        cli._cmd = undefined;
        var offs = this._offs;
        // Clear this first so exceptions in off functions only occur once
        this._offs = [];
        offs.forEach(f => f());
    }

    // (One-way) sync a command to this cli object: cmd changes -> update me.
    private _monitorCommandChanges(cmd: Command.Command) {
        var cli = this;
        // when the associated command (args or cmd) is updated from outside
        cli._offs.push(cmd.onany([Command.UpdatedArgsEvent, Command.UpdatedCmdEvent], function (e) {
            var cmd = e.cmd;
            if (e.from == cli._guid || e.from == 'init') {
                // ignore init and myself
                return;
            }
            var newprompt = cli._cmd.cmdChainToPrompt();
            // not a jQuery event because I want to crash if unhandled
            cli.onUpdatedPrompt(newprompt);
        }));
        cli._offs.push(cmd.on(Command.UpdatedStatusEvent, function (e) {
            var cmd = e.cmd;
            // if currently bound command is started
            if (cmd.status.code > 0) {
                var root = globals.cmds[cmd.getGid()];
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
    }

    // When a command is synced with this CLI certain bookkeeping applies: if
    // the command is ever updated from the outside, the CLI must know! How? By
    // hooking to every (significant) update, checking who caused the update,
    // and taking appropriate action.
    private _prepareCmdForSync(cmd: Command.Command) {
        var cli = this;
        if (!(cmd instanceof Command.Command)) {
            throw new Error("Argument to _prepareCmdForSync must be a Command");
        }
        // Sneaky integrity check
        if ((<any>cmd)._prepareCmdForSyncSanityCheck !== undefined) {
            throw new Error("_prepareCmdForSync already called on this command");
        }
        (<any>cmd)._prepareCmdForSyncSanityCheck = true;
        cli._monitorCommandChanges(cmd);
    }

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
    setprompt(txt: string, ignoreParseError?: boolean): JQueryPromise<Command.Command> {
        var cli = this;
        return cli._setprompt_safe(txt, !!ignoreParseError);
    }

    // bare version of setprompt (no locking)
    private _setprompt_aux(txt: string, ignoreParseError: boolean): JQueryPromise<Command.Command> {
        var cli = this;
        if (!(typeof txt == "string")) {
            throw new Error("argument to setprompt must be the raw prompt, as a string");
        }
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
    }

    // commit the current prompt ([enter] button)
    commit() {
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
        var cmdDone = function (e: Command.DoneEvent) {
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
            root.mapTree(function (cmd) {
                $promptcpy.addClass('promptcopy-' + cmd.nid);
                cmd.start();
                runningCmds += 1;
                cli._offs.push(cmd.one(Command.DoneEvent, cmdDone));
            });
        });
    }

    // user hit <tab>. assumes pointer is at end of input, as previously set
    // with setprompt(). oo! bery easy!
    complete(filenameCallback: (fname: string) => void) {
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
    }
}
